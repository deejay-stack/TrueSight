import sharp from "sharp";
import { infer } from "./InferenceService.js";
import { toAnalysisResult, type AnalysisResult } from "./DetectionResult.js";

type ImagePredictionLabel = "Human" | "AI-generated" | "Needs Review";
const IMAGE_AI_THRESHOLD = 0.50;
const IMAGE_HUMAN_CONFIDENT_MAX = 0.50;
const IMAGE_AI_CONFIDENT_MIN = 0.50;
const getConfidenceLevel = (score: number) => score >= 85 ? "Very High" : score >= 72 ? "High" : score >= 60 ? "Moderate" : "Low";

const inspectImage = async (imageBuffer: Buffer) => {
  const pipeline = sharp(imageBuffer);
  const metadata = await pipeline.metadata();
  const stats = await sharp(imageBuffer)
    .stats()
    .catch(() => null);
  const dominant = stats?.dominant;

  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? null,
    space: metadata.space ?? null,
    channels: metadata.channels ?? null,
    hasAlpha: Boolean(metadata.hasAlpha),
    density: metadata.density ?? null,
    sizeBytes: imageBuffer.byteLength,
    dominantColor: dominant
      ? {
          r: dominant.r,
          g: dominant.g,
          b: dominant.b,
        }
      : null,
  };
};

const buildImageDetails = ({
  source,
  provider,
  verdict,
  aiProbability,
  humanProbability,
  confidenceScore,
  predictedLabel,
  modelLabel,
  fileName,
  imageProfile,
  labels,
  classProbabilities,
  rawOutput,
  modelStatus,
  threshold,
  humanConfidentMax,
  aiConfidentMin,
  message,
  timings,
  preprocessing,
  warning,
}: {
  source: string;
  provider: string;
  verdict: string;
  aiProbability: number;
  humanProbability: number;
  confidenceScore: number;
  predictedLabel?: ImagePredictionLabel | null;
  modelLabel?: "Human" | "AI-generated" | null;
  fileName?: string | null;
  imageProfile?: Record<string, unknown> | null;
  labels?: string[] | null;
  classProbabilities?: Array<{ label: string; probability: number }>;
  rawOutput?: number[];
  modelStatus: Record<string, unknown>;
  threshold?: number;
  humanConfidentMax?: number;
  aiConfidentMin?: number;
  message?: string;
  timings?: Record<string, number>;
  preprocessing?: Record<string, unknown>;
  warning?: string;
}): Record<string, unknown> => {
  const dimensions =
    imageProfile?.width && imageProfile?.height
      ? `${imageProfile.width}x${imageProfile.height}`
      : "Unavailable";

  return {
    detectorType: "image",
    source,
    provider,
    verdict,
    aiProbability,
    humanProbability,
    confidenceScore,
    finalPrediction: predictedLabel ?? verdict,
    predictedLabel: predictedLabel ?? verdict,
    modelLabel: modelLabel ?? null,
    message,
    threshold: threshold ?? IMAGE_AI_THRESHOLD,
    humanConfidentMax: humanConfidentMax ?? IMAGE_HUMAN_CONFIDENT_MAX,
    aiConfidentMin: aiConfidentMin ?? IMAGE_AI_CONFIDENT_MIN,
    confidenceLevel: getConfidenceLevel(confidenceScore),
    riskBand: verdict,
    fileName: fileName ?? null,
    modelInputSize: "224x224",
    preprocessing:
      preprocessing ?? {
        convertToRgb: true,
        exifOrientationHandled: true,
        resize: "224x224",
        inputScale: "0_1",
      },
    timings: timings ?? null,
    classLabels: labels ?? null,
    classProbabilities: classProbabilities ?? [],
    rawOutput: rawOutput ?? [],
    imageProfile: imageProfile ?? null,
    warning,
    scoreCards: [
      {
        id: "aiProbability",
        label: "AI image probability",
        value: aiProbability,
        unit: "%",
        tone: predictedLabel === "AI-generated" ? "risk" : "calm",
        description: "Model estimate that the image is synthetic or AI-generated.",
      },
      {
        id: "humanProbability",
        label: "Human probability",
        value: humanProbability,
        unit: "%",
        tone: predictedLabel === "Human" ? "calm" : "risk",
        description: "Model estimate that the image is human-created.",
      },
      {
        id: "confidenceScore",
        label: "Confidence score",
        value: confidenceScore,
        unit: "%",
        tone: confidenceScore >= 72 ? "calm" : "warning",
        description: "Distance from an uncertain 50/50 result.",
      },
      {
        id: "imageSize",
        label: "Image dimensions",
        value: dimensions,
        unit: "",
        tone: "neutral",
        description: "Original image size read before resizing for model input.",
      },
    ],
    analysisTimeline: [
      {
        label: "Image decoding",
        status: imageProfile ? "complete" : "needs-review",
        detail: imageProfile
          ? `${dimensions} ${imageProfile.format ?? "image"} file decoded.`
          : "Image metadata could not be read.",
      },
      {
        label: "Model loading",
        status: modelStatus.loaded ? "complete" : "fallback",
        detail: modelStatus.message,
      },
      {
        label: "Threshold review",
        status: predictedLabel === "Needs Review" ? "needs-review" : "complete",
        detail:
          predictedLabel === "Needs Review"
            ? `AI probability is inside the review band (${((humanConfidentMax ?? IMAGE_HUMAN_CONFIDENT_MAX) * 100).toFixed(0)}%-${((aiConfidentMin ?? IMAGE_AI_CONFIDENT_MIN) * 100).toFixed(0)}%).`
            : `Decision threshold ${((threshold ?? IMAGE_AI_THRESHOLD) * 100).toFixed(0)}% (AI only above the threshold).`,
      },
      {
        label: "Class probability review",
        status: classProbabilities?.length ? "complete" : "needs-review",
        detail: classProbabilities?.length
          ? `${classProbabilities.length} model classes returned probabilities.`
          : "No model class probabilities were available.",
      },
    ],
    visualSignals: [
      {
        label: "Metadata profile",
        value: imageProfile ? "Available" : "Unavailable",
        detail:
          "Metadata helps teachers inspect format, size, dimensions, and color profile context.",
      },
      {
        label: "Classifier classes",
        value: classProbabilities?.length ?? 0,
        detail:
          "Class probabilities show which trained category contributed to the final score.",
      },
      {
        label: "Review reliability",
        value: modelStatus.loaded ? "Model-backed" : "Needs model setup",
        detail:
          "Image detection is strongest when the trained EfficientNetV2 Keras model is available.",
      },
    ],
    reviewChecklist: [
      {
        label: "Open the submitted image and inspect visible artifacts",
        status: "recommended",
      },
      {
        label: "Compare with assignment requirements and original source evidence",
        status: "recommended",
      },
      {
        label: "Treat image model output as a review signal, not standalone proof",
        status: "required",
      },
    ],
    integrationStatus: {
      providerConfigured: Boolean(modelStatus.loaded),
      liveProviderUsed: Boolean(modelStatus.loaded),
      fallbackUsed: !modelStatus.loaded,
      message: modelStatus.message,
    },
    note: "Image result depends on the quality and balance of the trained dataset.",
  };
};

export const analyzeImage = async (fileDataUrl?: string | null, fileName?: string | null): Promise<AnalysisResult> => {
  if (!fileDataUrl) throw new Error("Image content is required.");
  const encoded = fileDataUrl.includes(",") ? fileDataUrl.split(",")[1] : fileDataUrl;
  const imageBuffer = Buffer.from(encoded, "base64");
  const imageProfile = await inspectImage(imageBuffer);
  const prediction = await infer("image", { image: imageBuffer.toString("base64") });
  const result = toAnalysisResult(prediction);
  const label = prediction.predictedLabel === "AI" ? "AI-generated" : "Human";
  result.details = {
    ...buildImageDetails({
      source: "local-efficientnetv2-model", provider: prediction.modelName,
      verdict: label, predictedLabel: label, modelLabel: label,
      aiProbability: result.aiProbability!, humanProbability: result.humanProbability!,
      confidenceScore: result.confidenceScore!, fileName, imageProfile,
      labels: ["Human", "AI-generated"],
      classProbabilities: [
        { label: "Human", probability: result.humanProbability! },
        { label: "AI-generated", probability: result.aiProbability! },
      ],
      threshold: prediction.threshold,
      modelStatus: { loaded: true, message: "Local EfficientNetV2L loaded and returned class probabilities." },
      timings: prediction.timings as Record<string, number>,
      preprocessing: prediction.preprocessing as Record<string, unknown>,
      rawOutput: prediction.rawOutput as number[],
    }),
    modelName: prediction.modelName, status: "completed", analysisStatus: "completed",
    probabilities: result.details.probabilities,
    message: "Probabilities are guidance for teacher review, not proof of academic misconduct.",
  };
  return result;
};
