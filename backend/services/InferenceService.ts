import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DetectorType = "text" | "code" | "image";
export type ModelResult = {
  detectorType: DetectorType;
  predictedLabel: "AI" | "HUMAN";
  aiProbability: number;
  humanProbability: number;
  aiPercentage: number;
  humanPercentage: number;
  threshold: number;
  modelName: string;
  status: "completed";
  [key: string]: unknown;
};

const modelNames = { text: "DeBERTa-v3-base V3", code: "CodeT5-BiLSTM", image: "EfficientNetV2L" };
let models = Object.fromEntries(Object.entries(modelNames).map(([key, model]) => [key, { loaded: false, model }]));
let child: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<void> | null = null;
let sequence = 0;
const pending = new Map<string, { resolve: (result: ModelResult) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

export const getModelHealth = () => ({
  status: Object.values(models).every((model) => model.loaded) ? "ok" : "degraded",
  models,
});

const projectRoot = () => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "backend", "services", "efficientnetv2_predict.py"))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Cannot locate the inference worker.");
    directory = parent;
  }
  return directory;
};

export const startInferenceWorker = (): Promise<void> => {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const root = projectRoot();
    const venvPython = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    child = spawn(process.env.PYTHON_EXECUTABLE ?? process.env.PYTHON_PATH ?? (existsSync(venvPython) ? venvPython : "python"), [
      "-u", path.join(root, "backend", "services", "efficientnetv2_predict.py"), "--all-models",
    ], { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", HF_HOME: process.env.HF_HOME ?? path.join(root, ".cache", "huggingface") },
    });
    const worker = child;
    const timer = setTimeout(() => {
      fail(new Error("AI models did not finish starting."));
      worker.kill();
    }, Number(process.env.AI_STARTUP_TIMEOUT_MS ?? 600_000));
    const fail = (error: Error) => {
      clearTimeout(timer);
      models = Object.fromEntries(Object.entries(modelNames).map(([key, model]) => [key, { loaded: false, model }]));
      reject(error);
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(error);
      }
      pending.clear();
      // Keep the failed startup promise. A restart is explicit, never per request.
    };
    let buffer = "";
    worker.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim().startsWith("{")) continue;
        try {
          const payload = JSON.parse(line);
          if (payload.type === "ready") {
            for (const key of Object.keys(modelNames)) {
              models[key].loaded = payload.models?.[key]?.loaded === true;
            }
            clearTimeout(timer);
            resolve();
            continue;
          }
          const request = pending.get(payload.id);
          if (!request) continue;
          clearTimeout(request.timer);
          pending.delete(payload.id);
          if (payload.error) request.reject(new Error("AI detection temporarily unavailable."));
          else request.resolve(payload);
        } catch {
          fail(new Error("Invalid inference worker response."));
          worker.kill();
        }
      }
    });
    worker.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    worker.on("error", fail);
    worker.stdin.on("error", fail);
    worker.on("exit", () => fail(new Error("AI inference worker stopped.")));
  });
  return ready;
};

export const stopInferenceWorker = () => { child?.kill(); };
process.once("exit", stopInferenceWorker);

export const infer = async (detectorType: DetectorType, input: { text?: string; image?: string }): Promise<ModelResult> => {
  await startInferenceWorker();
  if (!models[detectorType]?.loaded || !child || child.killed) throw new Error("AI detection temporarily unavailable.");
  const id = `inference-${++sequence}`;
  const result = await new Promise<ModelResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("AI detection temporarily unavailable."));
    }, Number(process.env.AI_INFERENCE_TIMEOUT_MS ?? 120_000));
    pending.set(id, { resolve, reject, timer });
    child!.stdin.write(`${JSON.stringify({ id, detectorType, ...input })}\n`, (error) => {
      if (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  });
  if (result.detectorType !== detectorType || result.status !== "completed" ||
      !["AI", "HUMAN"].includes(result.predictedLabel) ||
      ![result.aiProbability, result.humanProbability].every((p) => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1) ||
      Math.abs(result.aiProbability + result.humanProbability - 1) > 1e-5 ||
      !Number.isFinite(result.threshold)) throw new Error("Invalid inference result.");
  return result;
};
