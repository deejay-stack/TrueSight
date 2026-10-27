import { useEffect, useState } from "react";
import { fetchDocumentPreview, type DocumentPreviewType } from "../../services/classService";
import type { PreviewSource } from "../../utils/filePreview";
import { DocumentPreview } from "./DocumentPreview";
import { PreviewStatus } from "./PreviewStatus";

export function AuthorizedDocumentPreview({ documentType, documentId, darkMode, code = false, language, className }: {
  documentType: DocumentPreviewType; documentId: string; darkMode: boolean; code?: boolean; language?: string | null; className?: string;
}) {
  const key = `${documentType}/${documentId}`;
  const [state, setState] = useState<{ key: string; source?: PreviewSource; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    void fetchDocumentPreview(documentType, documentId).then((document) => {
      if (active) setState({ key, source: { ...document, code, language } });
    }).catch((error: unknown) => {
      if (active) setState({ key, error: error instanceof Error ? error.message : "Document not found or access denied." });
    });
    return () => { active = false; };
  }, [documentType, documentId, key, code, language]);
  if (state?.key !== key) return <PreviewStatus loading message="Loading authorized document…" />;
  if (!state.source) return <PreviewStatus message={state.error ?? "Document could not be loaded. Your review and grading remain available."} />;
  return <DocumentPreview key={key} source={state.source} darkMode={darkMode} className={className} />;
}
