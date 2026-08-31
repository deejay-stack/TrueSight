export type CodeRunResult = {
  output: string;
  previewHtml?: string;
};

const JAVASCRIPT_TIMEOUT_MS = 4_000;
const PYTHON_TIMEOUT_MS = 20_000;
const PYODIDE_VERSION = "0.27.7";

export const normalizeProgrammingLanguage = (
  language: string | null | undefined,
) => (language ?? "code").trim().toLowerCase().replace(/\s+/g, "");

export const getProgrammingLanguageLabel = (
  language: string | null | undefined,
) => language?.trim() || "Code";

const formatError = (error: unknown) =>
  error instanceof Error ? error.stack || error.message : String(error);

const runWorker = (
  source: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
) => {
  const blobUrl = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  const worker = new Worker(blobUrl, { type: "module" });

  return new Promise<string>((resolve) => {
    let settled = false;
    let timeoutId = 0;

    const finish = (output: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
      resolve(output);
    };

    timeoutId = window.setTimeout(
      () => finish(`Execution stopped after ${timeoutMs / 1000} seconds.`),
      timeoutMs,
    );
    worker.onmessage = (event: MessageEvent<{ output: string }>) =>
      finish(event.data.output);
    worker.onerror = (event) =>
      finish(event.message || "The browser could not start the code runtime.");
    worker.postMessage(payload);
  });
};

const runJavaScript = (code: string, stdin: string, typescript = false) =>
  runWorker(
    `
const formatValue = (value) => {
  if (typeof value === "string") return value;
  if (typeof value === "undefined") return "undefined";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

self.onmessage = async ({ data }) => {
  const output = [];
  const input = String(data.stdin || "").split(/\\r?\\n/);
  const consoleProxy = {};
  ["log", "info", "warn", "error"].forEach((level) => {
    consoleProxy[level] = (...args) => output.push(args.map(formatValue).join(" "));
  });

  try {
    let executableCode = data.code;
    if (data.typescript) {
      const ts = await import("https://esm.sh/typescript@6.0.2");
      executableCode = ts.transpileModule(data.code, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
      }).outputText;
    }
    const execute = new Function(
      "console",
      "prompt",
      '"use strict"; return (async () => {\\n' + executableCode + '\\n})();',
    );
    const result = await execute(consoleProxy, () => input.shift() ?? "");
    if (typeof result !== "undefined") output.push(formatValue(result));
    self.postMessage({ output: output.join("\\n") || "Program finished with no output." });
  } catch (error) {
    self.postMessage({ output: error && error.stack ? error.stack : String(error) });
  }
};
`,
    { code, stdin, typescript },
    typescript ? PYTHON_TIMEOUT_MS : JAVASCRIPT_TIMEOUT_MS,
  );

const runPython = (code: string, stdin: string) =>
  runWorker(
    `
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs";

self.onmessage = async ({ data }) => {
  const output = [];
  const input = String(data.stdin || "").split(/\\r?\\n/);
  try {
    const pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/",
      stdin: () => input.shift() ?? null,
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line),
    });
    const result = await pyodide.runPythonAsync(data.code);
    if (result !== undefined && result !== null) output.push(String(result));
    self.postMessage({ output: output.join("\\n") || "Program finished with no output." });
  } catch (error) {
    self.postMessage({ output: error && error.stack ? error.stack : String(error) });
  }
};
`,
    { code, stdin },
    PYTHON_TIMEOUT_MS,
  );

const buildMarkupPreview = (code: string, language: string) => {
  if (language === "css") {
    return `<!doctype html><html><head><style>${code}</style></head><body><main class="preview-root"><h1>CSS Preview</h1><p>Sample content for the submitted stylesheet.</p><button>Sample Button</button></main></body></html>`;
  }
  return code;
};

export async function runCode(
  code: string,
  language: string | null | undefined,
  stdin = "",
): Promise<CodeRunResult> {
  const normalizedLanguage = normalizeProgrammingLanguage(language);

  try {
    if (["javascript", "js"].includes(normalizedLanguage)) {
      return { output: await runJavaScript(code, stdin) };
    }

    if (["typescript", "ts"].includes(normalizedLanguage)) {
      return { output: await runJavaScript(code, stdin, true) };
    }

    if (["python", "py"].includes(normalizedLanguage)) {
      return { output: await runPython(code, stdin) };
    }

    if (["html", "css"].includes(normalizedLanguage)) {
      return {
        output: "Preview rendered successfully.",
        previewHtml: buildMarkupPreview(code, normalizedLanguage),
      };
    }

    return {
      output: `${getProgrammingLanguageLabel(language)} requires an isolated compiler runtime that is not configured for this deployment. JavaScript, TypeScript-compatible JavaScript, Python, HTML, and CSS can run in the browser sandbox.`,
    };
  } catch (error) {
    return { output: formatError(error) };
  }
}
