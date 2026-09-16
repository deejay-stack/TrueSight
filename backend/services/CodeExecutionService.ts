type SupportedExecutionLanguage = "dart" | "java" | "javascript" | "python";

type JudgeLanguage = {
  id: number;
  name: string;
};

type JudgeStatus = {
  id: number;
  description: string;
};

type JudgeSubmission = {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  exit_code?: number | null;
  exit_signal?: number | null;
  status?: JudgeStatus;
};

export type CodeExecutionResult = {
  language: SupportedExecutionLanguage;
  runtime: string;
  output: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: string;
  executionTime: string | null;
  memory: number | null;
  exitCode: number | null;
  exitSignal: number | null;
};

export class CodeExecutionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "CodeExecutionError";
    this.statusCode = statusCode;
  }
}

const EXECUTION_API_URL = (
  process.env.CODE_EXECUTION_API_URL ?? "https://ce.judge0.com"
).replace(/\/$/, "");
const EXECUTION_API_KEY = process.env.CODE_EXECUTION_API_KEY?.trim() ?? "";
const configuredKeyHeader =
  process.env.CODE_EXECUTION_API_KEY_HEADER?.trim() || "X-Auth-Token";
const EXECUTION_API_KEY_HEADER = /^[A-Za-z0-9-]+$/.test(configuredKeyHeader)
  ? configuredKeyHeader
  : "X-Auth-Token";

const SOURCE_CODE_LIMIT = 100_000;
const STANDARD_INPUT_LIMIT = 20_000;
const OUTPUT_LIMIT = 50_000;
const PROVIDER_TIMEOUT_MS = 20_000;
const LANGUAGE_CACHE_MS = 10 * 60 * 1000;

const LANGUAGE_ALIASES: Record<string, SupportedExecutionLanguage> = {
  dart: "dart",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  node: "javascript",
  nodejs: "javascript",
  python: "python",
  py: "python",
  python3: "python",
};

const LANGUAGE_PATTERNS: Record<SupportedExecutionLanguage, RegExp> = {
  dart: /^Dart\s*\(/i,
  java: /^Java\s*\((?:JDK|OpenJDK)/i,
  javascript: /^JavaScript\s*\(Node\.js/i,
  python: /^Python\s*\(3(?:\.|\))/i,
};

let cachedLanguages: { expiresAt: number; values: JudgeLanguage[] } | null = null;

export const normalizeExecutionLanguage = (
  language: unknown,
): SupportedExecutionLanguage | null => {
  const normalized = String(language ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");

  return LANGUAGE_ALIASES[normalized] ?? null;
};

const requestHeaders = () => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (EXECUTION_API_KEY) {
    headers[EXECUTION_API_KEY_HEADER] = EXECUTION_API_KEY;
  }

  return headers;
};

const requestProvider = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(`${EXECUTION_API_URL}${path}`, {
      ...init,
      headers: {
        ...requestHeaders(),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      const providerMessage =
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : "The compiler service rejected the request.";
      throw new CodeExecutionError(providerMessage, response.status === 429 ? 429 : 502);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof CodeExecutionError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CodeExecutionError("The compiler service timed out.", 504);
    }
    throw new CodeExecutionError(
      "The compiler service is currently unavailable. Please try again.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
};

const parseVersion = (name: string) => {
  const match = name.match(/(\d+(?:\.\d+)+|\d+)/);
  return (match?.[1] ?? "0").split(".").map((part) => Number(part) || 0);
};

const compareVersions = (left: JudgeLanguage, right: JudgeLanguage) => {
  const leftVersion = parseVersion(left.name);
  const rightVersion = parseVersion(right.name);
  const length = Math.max(leftVersion.length, rightVersion.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftVersion[index] ?? 0) - (rightVersion[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return left.id - right.id;
};

const getLanguages = async () => {
  if (cachedLanguages && cachedLanguages.expiresAt > Date.now()) {
    return cachedLanguages.values;
  }

  const values = await requestProvider<JudgeLanguage[]>("/languages", {
    method: "GET",
  });

  if (!Array.isArray(values)) {
    throw new CodeExecutionError("The compiler service returned an invalid language list.", 502);
  }

  cachedLanguages = {
    values,
    expiresAt: Date.now() + LANGUAGE_CACHE_MS,
  };
  return values;
};

const resolveRuntime = async (language: SupportedExecutionLanguage) => {
  const languages = await getLanguages();
  const matches = languages
    .filter((item) => LANGUAGE_PATTERNS[language].test(item.name))
    .sort(compareVersions);
  const runtime = matches.at(-1);

  if (!runtime) {
    throw new CodeExecutionError(
      `${language} is not installed on the configured compiler service.`,
      503,
    );
  }

  return runtime;
};

const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });

const waitForSubmission = async (submission: JudgeSubmission) => {
  if (submission.status && submission.status.id > 2) return submission;
  if (!submission.token) return submission;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(250);
    const completed = await requestProvider<JudgeSubmission>(
      `/submissions/${encodeURIComponent(submission.token)}?base64_encoded=false`,
      { method: "GET" },
    );
    if (completed.status && completed.status.id > 2) return completed;
  }

  throw new CodeExecutionError("The program did not finish within the allowed time.", 504);
};

const limitOutput = (value: string | null | undefined) =>
  String(value ?? "").slice(0, OUTPUT_LIMIT);

const formatOutput = (submission: JudgeSubmission) => {
  const stdout = limitOutput(submission.stdout);
  const stderr = limitOutput(submission.stderr);
  const compileOutput = limitOutput(submission.compile_output);
  const message = limitOutput(submission.message);
  const statusId = submission.status?.id;
  const sections: string[] = [];

  if (compileOutput) {
    sections.push(
      `${statusId === 6 ? "Compilation error" : "Compiler output"}:\n${compileOutput.trimEnd()}`,
    );
  }
  if (stdout) sections.push(stdout.trimEnd());
  if (stderr) sections.push(`Standard error:\n${stderr.trimEnd()}`);
  if (message) sections.push(`Runtime message:\n${message.trimEnd()}`);

  if (sections.length === 0) {
    if (statusId === 3) {
      return "Program completed successfully with no output.";
    }
    return submission.status?.description || "Program execution finished with no output.";
  }

  return sections.join("\n\n").slice(0, OUTPUT_LIMIT);
};

const completedWithoutOutput = (submission: JudgeSubmission) =>
  submission.status?.id === 3 &&
  !submission.stdout &&
  !submission.stderr &&
  !submission.compile_output &&
  !submission.message;

const buildExpressionCaptureSource = (
  language: SupportedExecutionLanguage,
  sourceCode: string,
) => {
  if (language === "javascript") {
    return `
const __truesightSource = ${JSON.stringify(sourceCode)};
const __truesightResult = eval(__truesightSource);
if (typeof __truesightResult !== "undefined") {
  console.log(__truesightResult);
}
`;
  }

  if (language === "python") {
    return `
import ast as __truesight_ast

__truesight_source = ${JSON.stringify(sourceCode)}
__truesight_tree = __truesight_ast.parse(__truesight_source, filename="submission.py")

def __truesight_display(value):
    if value is not None:
        print(value)

if __truesight_tree.body and isinstance(__truesight_tree.body[-1], __truesight_ast.Expr):
    __truesight_tree.body[-1] = __truesight_ast.Expr(
        value=__truesight_ast.Call(
            func=__truesight_ast.Name(id="__truesight_display", ctx=__truesight_ast.Load()),
            args=[__truesight_tree.body[-1].value],
            keywords=[],
        )
    )
    __truesight_ast.fix_missing_locations(__truesight_tree)

exec(compile(__truesight_tree, "submission.py", "exec"))
`;
  }

  return null;
};

const submitProgram = async (
  runtime: JudgeLanguage,
  sourceCode: string,
  stdin: string,
) => {
  const created = await requestProvider<JudgeSubmission>(
    "/submissions?base64_encoded=false&wait=true",
    {
      method: "POST",
      body: JSON.stringify({
        language_id: runtime.id,
        source_code: sourceCode,
        stdin,
        cpu_time_limit: 3,
        wall_time_limit: 5,
        memory_limit: 128_000,
        max_file_size: 1_024,
      }),
    },
  );

  return waitForSubmission(created);
};

export const executeCode = async (input: {
  language: unknown;
  sourceCode: unknown;
  stdin?: unknown;
}): Promise<CodeExecutionResult> => {
  const language = normalizeExecutionLanguage(input.language);
  if (!language) {
    throw new CodeExecutionError(
      "Supported languages are Java, JavaScript, Python, and Dart.",
      400,
    );
  }

  const sourceCode = typeof input.sourceCode === "string" ? input.sourceCode : "";
  const stdin = typeof input.stdin === "string" ? input.stdin : "";

  if (!sourceCode.trim()) {
    throw new CodeExecutionError("Source code is required.", 400);
  }
  if (sourceCode.length > SOURCE_CODE_LIMIT) {
    throw new CodeExecutionError("Source code must be 100 KB or smaller.", 413);
  }
  if (stdin.length > STANDARD_INPUT_LIMIT) {
    throw new CodeExecutionError("Standard input must be 20 KB or smaller.", 413);
  }

  const runtime = await resolveRuntime(language);
  let submission = await submitProgram(runtime, sourceCode, stdin);

  if (completedWithoutOutput(submission)) {
    const expressionCaptureSource = buildExpressionCaptureSource(
      language,
      sourceCode,
    );
    if (expressionCaptureSource) {
      submission = await submitProgram(runtime, expressionCaptureSource, stdin);
    }
  }

  return {
    language,
    runtime: runtime.name,
    output: formatOutput(submission),
    stdout: limitOutput(submission.stdout),
    stderr: limitOutput(submission.stderr),
    compileOutput: limitOutput(submission.compile_output),
    status: submission.status?.description ?? "Finished",
    executionTime: submission.time ?? null,
    memory: submission.memory ?? null,
    exitCode: submission.exit_code ?? null,
    exitSignal: submission.exit_signal ?? null,
  };
};
