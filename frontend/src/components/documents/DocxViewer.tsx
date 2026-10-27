import { useEffect, useState } from "react";
import mammoth from "mammoth";
import { readPreviewBytes } from "../../utils/filePreview";
import { sanitizeDocumentHtml } from "../../utils/docxPreview";
import { PreviewStatus } from "./PreviewStatus";

export default function DocxViewer({ dataUrl, zoom }: { dataUrl: string; zoom: number }) {
  const [result, setResult] = useState<{ source: string; html?: string; error?: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { value } = await mammoth.convertToHtml({ arrayBuffer: readPreviewBytes(dataUrl).buffer }, { externalFileAccess: false });
        const html = sanitizeDocumentHtml(value);
        if (active) setResult({ source: dataUrl, html });
      } catch {
        if (active) setResult({ source: dataUrl, error: true });
      }
    })();
    return () => { active = false; };
  }, [dataUrl]);
  if (!result || result.source !== dataUrl) return <PreviewStatus loading message="Preparing Word document preview…" />;
  if (result.error) return <PreviewStatus message="Preview could not be generated. You may still download the original submission." />;
  return <div className="docx-preview-wrap" style={{ fontSize: `${zoom * 16}px` }}>
    <p className="document-preview-note">Readable Word preview. Pagination, fonts, and complex layouts may differ from the original.</p>
    <article className="docx-preview-paper" aria-label="Word document content" dangerouslySetInnerHTML={{ __html: result.html ?? "" }} />
  </div>;
}
