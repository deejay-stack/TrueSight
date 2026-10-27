export type PreviewSource = {
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  dataUrl?: string | null;
  textContent?: string | null;
  language?: string | null;
  code?: boolean;
};

export type PreviewKind = "pdf" | "docx" | "image" | "text" | "code" | "unsupported";
const codeLanguages: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python",
  java: "java", c: "c", cpp: "c++", cs: "c#", php: "php", sql: "sql", css: "css", html: "html", dart: "dart",
};
export const previewLanguage = (source: PreviewSource) => source.language ?? codeLanguages[source.fileName.toLowerCase().split(".").pop() ?? ""];

export const previewKind = (source: PreviewSource): PreviewKind => {
  const extension = source.fileName.toLowerCase().split(".").pop() ?? "";
  const mime = source.fileType?.toLowerCase() ?? "";
  if (source.code || previewLanguage(source)) return "code";
  if (extension === "pdf" || mime === "application/pdf") return "pdf";
  if (extension === "docx" || mime.includes("wordprocessingml.document")) return "docx";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(extension) || /^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(mime)) return "image";
  if (["txt", "md", "csv", "json", "log"].includes(extension) || mime.startsWith("text/") || (!source.dataUrl && source.textContent != null)) return "text";
  return "unsupported";
};

/** File bytes come only from existing authorized API responses or local drafts. */
export const readPreviewBytes = (dataUrl: string): Uint8Array<ArrayBuffer> => {
  if (!/^data:[^,]*,/i.test(dataUrl)) throw new Error("Invalid preview data.");
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  if (/;base64$/i.test(header)) {
    const binary = atob(dataUrl.slice(comma + 1));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(dataUrl.slice(comma + 1)));
};

export const originalBlob = (source: PreviewSource): Blob | null => {
  if (source.dataUrl) return new Blob([readPreviewBytes(source.dataUrl)], { type: source.fileType ?? "application/octet-stream" });
  if (source.textContent != null) return new Blob([source.textContent], { type: "text/plain;charset=utf-8" });
  return null;
};
