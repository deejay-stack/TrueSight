import type { PreviewDocument } from "../services/classService";

export type DraftPreviewDocument = Omit<PreviewDocument, "kind"> & {
  kind: "draft";
};

export type PreviewableDocument = PreviewDocument | DraftPreviewDocument;

export type PreparedFileUpload = {
  id: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileDataUrl: string;
  extractedText?: string;
};

export type UploadPurpose =
  | "activity-attachment"
  | "file-submission"
  | "image-submission"
  | "cor-upload";

const DRAFT_PREFIX = "truesight-draft-document:";
const MAX_PREVIEW_FILE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "txt",
  "md",
  "csv",
  "json",
]);
const FILE_SUBMISSION_EXTENSIONS = new Set(["pdf", "docx"]);
const IMAGE_SUBMISSION_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const getExtension = (fileName: string) =>
  fileName.toLowerCase().split(".").pop() ?? "";

export const formatFileSize = (size: number | null): string => {
  if (!size || !Number.isFinite(size)) {
    return "Unknown size";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const isSupportedPreviewFile = (
  file: File,
  purpose: UploadPurpose = "activity-attachment",
): boolean => {
  const extension = getExtension(file.name);

  if (purpose === "file-submission") {
    return FILE_SUBMISSION_EXTENSIONS.has(extension);
  }

  if (purpose === "image-submission" || purpose === "cor-upload") {
    return IMAGE_SUBMISSION_EXTENSIONS.has(extension);
  }

  return SUPPORTED_EXTENSIONS.has(extension);
};

export const validatePreviewFile = (
  file: File,
  purpose: UploadPurpose = "activity-attachment",
): string | null => {
  if (!isSupportedPreviewFile(file, purpose)) {
    if (purpose === "file-submission") {
      return "File activities only accept PDF or DOCX documents.";
    }

    if (purpose === "cor-upload") {
      return "COR uploads only accept PNG, JPG, JPEG, or WEBP images.";
    }

    if (purpose === "image-submission") {
      return "Image activities only accept PNG, JPG, JPEG, or WEBP images.";
    }

    return "Upload PDF, DOC, DOCX, image, or text-based files.";
  }

  if (file.size > MAX_PREVIEW_FILE_SIZE) {
    return "Files must be 5 MB or smaller for in-app preview.";
  }

  return null;
};

const readFileAsDataUrl = (
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(92, Math.round((event.loaded / event.total) * 92)));
      }
    };

    reader.onload = () => {
      onProgress?.(100);
      resolve(String(reader.result ?? ""));
    };

    reader.onerror = () => {
      reject(new Error("Unable to read this file."));
    };

    onProgress?.(12);
    reader.readAsDataURL(file);
  });

const readFileAsText = (file: File): Promise<string | undefined> =>
  new Promise((resolve) => {
    const extension = getExtension(file.name);
    const isText =
      file.type.startsWith("text/") || ["txt", "md", "csv", "json"].includes(extension);

    if (!isText) {
      resolve(undefined);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve(undefined);
    reader.readAsText(file);
  });

export const prepareFileUpload = async (
  file: File,
  onProgress?: (progress: number) => void,
  purpose: UploadPurpose = "activity-attachment",
): Promise<PreparedFileUpload> => {
  const validationError = validatePreviewFile(file, purpose);

  if (validationError) {
    throw new Error(validationError);
  }

  const [fileDataUrl, extractedText] = await Promise.all([
    readFileAsDataUrl(file, onProgress),
    readFileAsText(file),
  ]);

  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    fileName: file.name,
    fileType: file.type || `application/${getExtension(file.name)}`,
    fileSize: file.size,
    fileDataUrl,
    extractedText,
  };
};

export const saveDraftDocument = (
  upload: PreparedFileUpload,
  title: string,
  className: string | null,
): string => {
  const draft: DraftPreviewDocument = {
    id: upload.id,
    kind: "draft",
    title,
    className,
    fileName: upload.fileName,
    fileType: upload.fileType,
    fileSize: upload.fileSize,
    dataUrl: upload.fileDataUrl,
    textContent: upload.extractedText ?? null,
    status: "Draft",
    createdAt: new Date().toISOString(),
    submittedAt: null,
    ownerName: null,
  };

  sessionStorage.setItem(`${DRAFT_PREFIX}${upload.id}`, JSON.stringify(draft));
  return upload.id;
};

export const loadDraftDocument = (id: string): DraftPreviewDocument | null => {
  const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${id}`);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as DraftPreviewDocument;
  } catch {
    return null;
  }
};

export const documentCanUseNativeFrame = (document: PreviewableDocument): boolean => {
  const type = document.fileType?.toLowerCase() ?? "";
  const extension = getExtension(document.fileName);

  return (
    type === "application/pdf" ||
    extension === "pdf" ||
    type.startsWith("image/") ||
    ["txt", "md", "csv", "json"].includes(extension) ||
    type.startsWith("text/")
  );
};
