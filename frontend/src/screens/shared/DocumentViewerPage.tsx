import { DocumentPreview } from "../../components/documents/DocumentPreview";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileArchive,
  FileImage,
  FileText,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { useAuth } from "../../context/useAuth";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import {
  fetchDocumentPreview,
  type DocumentPreviewType,
} from "../../services/classService";
import {
  formatFileSize,
  loadDraftDocument,
  type PreviewableDocument,
} from "../../utils/documentPreview";
import { navigateBack } from "../../utils/navigation";

const isPreviewType = (value?: string): value is DocumentPreviewType =>
  value === "activity-attachment" || value === "submission" || value === "cor";

const getDocumentIcon = (document: PreviewableDocument) => {
  const type = document.fileType?.toLowerCase() ?? "";

  if (type.startsWith("image/")) {
    return FileImage;
  }

  if (type.includes("word") || document.fileName.toLowerCase().endsWith(".docx")) {
    return FileArchive;
  }

  return FileText;
};

export default function DocumentViewerPage() {
  const navigate = useNavigate();
  const { user, darkMode } = useAuth();
  const { documentType, documentId } = useParams<{
    documentType: string;
    documentId: string;
  }>();

  const [document, setDocument] = useState<PreviewableDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadDocument = async () => {
      if (!documentType || !documentId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const payload =
          documentType === "draft"
            ? loadDraftDocument(documentId)
            : isPreviewType(documentType)
              ? await fetchDocumentPreview(documentType, documentId)
              : null;

        if (!active) {
          return;
        }

        if (!payload) {
          setDocument(null);
          return;
        }

        setDocument(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load document.";
        toast.error(message);
        setDocument(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDocument();

    return () => {
      active = false;
    };
  }, [documentId, documentType]);

  const Icon = useMemo(
    () => (document ? getDocumentIcon(document) : FileText),
    [document],
  );

  const role = user?.role ?? "teacher";

  return (
    <div
      className="role-theme-page h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle(role, darkMode)}
    >
      <header className="fixed left-0 right-0 top-0 z-20 h-16 border-b theme-border bg-[color-mix(in_srgb,var(--app-bg)_72%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Button variant="outline" onClick={() => navigateBack(navigate, "/auth/login_screen")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <GlobalThemeToggle className="h-10 w-10" />
        </div>
      </header>

      <main
        data-route-scroll-container
        className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
        {loading ? (
          <Card className="theme-card">
            <CardContent className="flex items-center gap-3 p-6 text-sm theme-muted">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--app-accent)]" />
              Loading document preview...
            </CardContent>
          </Card>
        ) : !document ? (
          <Card className="theme-card">
            <CardContent className="p-6 text-sm theme-muted">
              Document not found or access denied.
            </CardContent>
          </Card>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            <Card className="theme-card overflow-hidden">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] text-[var(--app-accent)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="theme-muted text-xs uppercase tracking-wide">
                        {document.kind === "cor" ? "Certificate of Registration" : document.kind === "activity-attachment"
                          ? "Activity Attachment"
                          : document.kind === "submission"
                            ? "Submission Document"
                            : "Draft Document"}
                      </p>
                      <h1 className="mt-1 break-words text-2xl font-bold text-[var(--app-text)]">
                        {document.fileName}
                      </h1>
                      <p className="mt-1 text-sm theme-muted">{document.title}</p>
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-2 text-sm sm:min-w-56">
                    {document.className && (
                      <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-3 py-2">
                        <p className="text-xs theme-muted">Class</p>
                        <p className="font-medium text-[var(--app-text)]">{document.className}</p>
                      </div>
                    )}
                    <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-3 py-2">
                      <p className="text-xs theme-muted">File</p>
                      <p className="break-all font-medium text-[var(--app-text)]">
                        {document.fileType ?? "Unknown type"} - {formatFileSize(document.fileSize)}
                      </p>
                    </div>
                    {document.submittedAt && (
                      <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-3 py-2">
                        <p className="text-xs theme-muted">Submitted</p>
                        <p className="font-medium text-[var(--app-text)]">
                          {new Date(document.submittedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <DocumentPreview source={document} darkMode={darkMode} />
          </motion.div>
        )}
        </div>
      </main>
    </div>
  );
}
