import {readFile} from 'node:fs/promises';
export type SupportedExecutionLanguage = "dart" | "java" | "javascript" | "python";

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
  statusCode: number;
  category: string;
  outputTruncated: boolean;
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
  effectiveLimits?: {timeSeconds:number;timeKind:'wall'|'cpu';memoryKb:number;processes:number};
  notice?: string;
};

export class CodeExecutionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "CodeExecutionError";
    this.statusCode = statusCode;
  }
}

const configuredProvider=process.env.CODE_EXECUTION_PROVIDER?.trim().toLowerCase();
const ONLINE_COMPILER=configuredProvider==='onlinecompiler'||(!configuredProvider&&!process.env.CODE_EXECUTION_API_URL&&Boolean(process.env.ONLINE_COMPILER_API_KEY));
const EXECUTION_API_URL = (process.env.CODE_EXECUTION_API_URL ?? (ONLINE_COMPILER?'https://api.onlinecompiler.io/api/judge0':'')).replace(/\/$/, "");
const EXECUTION_API_KEY = process.env.CODE_EXECUTION_API_KEY?.trim() || (ONLINE_COMPILER?process.env.ONLINE_COMPILER_API_KEY?.trim():'') || "";
const EXECUTION_API_HOST = process.env.CODE_EXECUTION_API_HOST?.trim() ?? "";
const configuredKeyHeader =
  process.env.CODE_EXECUTION_API_KEY_HEADER?.trim() || (ONLINE_COMPILER?'Authorization':'X-Auth-Token');
const EXECUTION_API_KEY_HEADER = /^[A-Za-z0-9-]+$/.test(configuredKeyHeader)
  ? configuredKeyHeader
  : "X-Auth-Token";

const SOURCE_CODE_LIMIT = 100_000;
const STANDARD_INPUT_LIMIT = 20_000;
const OUTPUT_LIMIT = 50_000;
const PROVIDER_TIMEOUT_MS = 20_000;
const LANGUAGE_CACHE_MS = 10 * 60 * 1000;
export const executionPolicy=()=>ONLINE_COMPILER?{
  provider:'onlinecompiler',timeKind:'wall' as const,fixedMemoryKb:524288,processes:16,
  message:'OnlineCompiler uses a fixed 512 MB sandbox and 16 processes. The activity limit uses wall time with provider startup allowances; per-activity memory limits are unavailable.',
}:{provider:'judge0',timeKind:'cpu' as const,fixedMemoryKb:null,processes:32,message:''};

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

// Deployment approval records are operator-owned, never accepted from an HTTP body.
// A provider URL alone is not evidence that its isolation controls were verified.
export async function executionAvailability(language?:SupportedExecutionLanguage) {
  const unavailable={enabled:false,message:'Execution is disabled until a dedicated sandbox has been configured and verified.'};
  if(!EXECUTION_API_URL||!process.env.CODE_EXECUTION_APPROVAL_FILE)return unavailable;
  if(ONLINE_COMPILER&&!EXECUTION_API_KEY)return {enabled:false,message:'Add the OnlineCompiler API key to the backend environment before running code.'};
  if(EXECUTION_API_HOST&&!/^[A-Za-z0-9.-]+$/.test(EXECUTION_API_HOST))return unavailable;
  try {
    const url=new URL(EXECUTION_API_URL);
    if(url.username||url.password||!['https:','http:'].includes(url.protocol))return unavailable;
    if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return unavailable;
    const approval=JSON.parse(await readFile(process.env.CODE_EXECUTION_APPROVAL_FILE,'utf8'));
    const controls=['dedicatedHost','unprivilegedIsolation','noHostMounts','noApplicationSecrets','networkDisabled','cpuMemoryLimits','processLimits','outputLimits','temporaryWorkspaceCleanup'];
    if(approval.apiUrl!==EXECUTION_API_URL||approval.verified!==true||typeof approval.reviewedBy!=='string'||!approval.reviewedBy.trim()||!(Date.parse(approval.expiresAt)>Date.now())||!(Date.parse(approval.verifiedAt)<=Date.now())||!controls.every(c=>approval.controls?.[c]===true))return unavailable;
    if(language&&approval.languages?.[language]!==true)return {enabled:false,message:`${language} has not passed sandbox execution verification.`};
    if(language==='java'&&approval.javaPublicClassNames!==true)return {enabled:false,message:'Java entry-point handling has not passed sandbox verification.'};
    return {enabled:true,message:ONLINE_COMPILER?'OnlineCompiler sandbox connected. '+executionPolicy().message:'Dedicated execution service configured; deployment verification is current.'};
  }catch{return unavailable;}
}

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
  if (EXECUTION_API_HOST) headers['X-RapidAPI-Host'] = EXECUTION_API_HOST;

  return headers;
};

const requestProvider = async <T>(path: string, init?: RequestInit,timeoutMs=PROVIDER_TIMEOUT_MS): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${EXECUTION_API_URL}${path}`, {
      ...init,
      redirect:'error',
      headers: {
        ...requestHeaders(),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>512000){await reader.cancel();throw new CodeExecutionError('The compiler response exceeded its size limit.',502);}chunks.push(part.value);}
    let payload:Record<string,unknown>;
    try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new CodeExecutionError('The compiler returned an invalid response.',502);}

    if (!response.ok) {
      if(response.status===401||response.status===403)throw new CodeExecutionError('The execution service rejected its API credentials. Check the backend API key and account access.',503);
      throw new CodeExecutionError('The dedicated compiler service rejected the request. Try again later.', response.status === 429 ? 429 : 502);
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

  const deadline=Date.now()+20_000;
  for (let attempt = 0; attempt < 30&&Date.now()<deadline-250; attempt += 1) {
    await wait(250);
    const completed = await requestProvider<JudgeSubmission>(
      `/submissions/${encodeURIComponent(submission.token)}?base64_encoded=false`,
      { method: "GET" },Math.max(1,deadline-Date.now()),
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
      `${statusId === 6 ? "Compilation error" : "Compiler output"}:\n${compileOutput}`,
    );
  }
  if (stdout) sections.push(stdout);
  if (stderr) sections.push(`Standard error:\n${stderr}`);
  if (message) sections.push(`Runtime message:\n${message}`);

  if (sections.length === 0) {
    if (statusId === 3) {
      return "Program completed successfully with no output.";
    }
    return submission.status?.description || "Program execution finished with no output.";
  }

  return sections.join("\n\n").slice(0, OUTPUT_LIMIT);
};

const submitProgram = async (
  runtime: JudgeLanguage,
  sourceCode: string,
  stdin: string,
  limits = {cpuSeconds:3,memoryKb:128000},
) => {
  const created = await requestProvider<JudgeSubmission>(
    "/submissions?base64_encoded=false&wait=true",
    {
      method: "POST",
      body: JSON.stringify({
        language_id: runtime.id,
        source_code: sourceCode,
        stdin,
        cpu_time_limit: limits.cpuSeconds,
        wall_time_limit: Math.min(10,limits.cpuSeconds+2),
        ...(!ONLINE_COMPILER?{
        memory_limit: limits.memoryKb,
        max_file_size: 64,
        max_processes_and_or_threads: 32,
        enable_network: false,
        number_of_runs: 1,
        }:{}),
      }),
    },
  );

  return waitForSubmission(created);
};

export const executeCode = async (input: {
  language: unknown;
  sourceCode: unknown;
  stdin?: unknown;
  limits?: {cpuSeconds:number;memoryKb:number};
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
  if (Buffer.byteLength(sourceCode, "utf8") > SOURCE_CODE_LIMIT) {
    throw new CodeExecutionError("Source code must be 100 KB or smaller.", 413);
  }
  if (Buffer.byteLength(stdin, "utf8") > STANDARD_INPUT_LIMIT) {
    throw new CodeExecutionError("Standard input must be 20 KB or smaller.", 413);
  }

  const availability=await executionAvailability(language);
  if(!availability.enabled)throw new CodeExecutionError(availability.message,503);
  const limits=input.limits??{cpuSeconds:3,memoryKb:128000};
  if(!Number.isInteger(limits.cpuSeconds)||limits.cpuSeconds<1||limits.cpuSeconds>5||!Number.isInteger(limits.memoryKb)||limits.memoryKb<64000||limits.memoryKb>256000)throw new CodeExecutionError('Invalid configured execution limits.',400);
  const runtime = await resolveRuntime(language);
  const submission = await submitProgram(runtime, sourceCode, stdin,limits);

  return {
    statusCode:submission.status?.id??0,
    category:submission.status?.id===3?'success':submission.status?.id===5?'time_limit':submission.status?.id===6?'compilation_error':/memory limit|out of memory/i.test(submission.status?.description??'')?'memory_limit':submission.status?.id&&submission.status.id>=7&&submission.status.id<=12?'runtime_error':'service_error',
    outputTruncated:[submission.stdout,submission.stderr,submission.compile_output,submission.message].some(value=>(value?.length??0)>OUTPUT_LIMIT),
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
    effectiveLimits:{timeSeconds:limits.cpuSeconds,timeKind:ONLINE_COMPILER?'wall':'cpu',memoryKb:ONLINE_COMPILER?524288:limits.memoryKb,processes:ONLINE_COMPILER?16:32},
    ...(ONLINE_COMPILER?{notice:executionPolicy().message}:{}),
  };
};
