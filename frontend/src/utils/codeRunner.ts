import { API_BASE_URL } from "../config/api";
import {
  createOfflineActionError,
  isConnectionAvailable,
  isLikelyConnectivityError,
  markBackendReachable,
  markBackendUnreachable,
} from "../services/connectivity";

export type CodeRunResult = {
  output: string;
  previewHtml?: string;
  status?: string;
  runtime?: string;
  executionTime?: string | null;
  memory?: number | null;
  exitCode?: number | null;
};

type CompilerResponse = {
  result?: CodeRunResult;
  message?: string;
};

const COMPILER_LANGUAGES = new Set([
  "dart",
  "java",
  "javascript",
  "js",
  "node",
  "nodejs",
  "python",
  "py",
  "python3",
]);

export const normalizeProgrammingLanguage = (
  language: string | null | undefined,
) => (language ?? "code").trim().toLowerCase().replace(/[\s._-]+/g, "");

export const getProgrammingLanguageLabel = (
  language: string | null | undefined,
) => language?.trim() || "Code";

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const executeWithCompiler = async (
  code: string,
  language: string,
  stdin: string,
): Promise<CodeRunResult> => {
  if (!isConnectionAvailable()) {
    throw createOfflineActionError();
  }

  try {
    const response = await fetch(`${API_BASE_URL}/classes/code/execute`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceCode: code, language, stdin }),
    });
    markBackendReachable();

    const payload = (await response.json().catch(() => ({}))) as CompilerResponse;
    if (!response.ok || !payload.result) {
      throw new Error(payload.message || "The compiler could not execute this program.");
    }

    return payload.result;
  } catch (error) {
    if (isLikelyConnectivityError(error)) {
      markBackendUnreachable();
    }
    throw error;
  }
};

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
    if (COMPILER_LANGUAGES.has(normalizedLanguage)) {
      return await executeWithCompiler(code, normalizedLanguage, stdin);
    }

    // Retain previews for older HTML/CSS activities, although new code
    // activities are intentionally limited to the four compiler languages.
    if (["html", "css"].includes(normalizedLanguage)) {
      return {
        output: "Preview rendered successfully.",
        previewHtml: buildMarkupPreview(code, normalizedLanguage),
        status: "Preview",
      };
    }

    return {
      output:
        `${getProgrammingLanguageLabel(language)} is not enabled in the compiler. ` +
        "Supported languages are Java, JavaScript, Python, and Dart.",
      status: "Unsupported language",
    };
  } catch (error) {
    return {
      output: formatError(error),
      status: "Execution service error",
    };
  }
}
