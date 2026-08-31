import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Check, Code2, Eye, FileText, Image as ImageIcon, Pencil } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import type { ClassActivity } from "../services/studentClassroomService";

type StudentSubmissionModalProps = {
  activity: ClassActivity | null;
  essayContent: string;
  fileName: string;
  isSubmitting: boolean;
  onChangeEssay: (value: string) => void;
  onSelectFile: (fileName: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const getSubmissionTypeLabel = (type: string) => {
  if (type === "code") return "Code";
  if (type === "image") return "Image";
  if (type === "file") return "File";
  return "Essay";
};

const getAcceptedFileTypes = (type: string) =>
  type === "image" ? ".png,.jpg,.jpeg,.webp" : ".pdf,.docx";

export function StudentSubmissionModal({
  activity,
  essayContent,
  fileName,
  isSubmitting,
  onChangeEssay,
  onSelectFile,
  onClose,
  onSubmit,
}: StudentSubmissionModalProps) {
  const [previewActivityId, setPreviewActivityId] = useState<string | null>(null);
  const isPreviewing = Boolean(activity && previewActivityId === activity.id);

  const isEssay = activity?.submissionType === "essay";
  const isCode = activity?.submissionType === "code";
  const isImage = activity?.submissionType === "image";
  const trimmedEssay = essayContent.trim();
  const trimmedFileName = fileName.trim();
  const canPreview = activity
    ? isEssay || isCode
      ? trimmedEssay.length > 0
      : trimmedFileName.length > 0
    : false;
  const hasExistingSubmission = Boolean(activity?.mySubmission);

  return (
    <AnimatePresence>
      {activity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.button
            className="absolute inset-0 bg-[var(--sidebar-backdrop)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="theme-surface relative w-full max-w-xl rounded-3xl overflow-hidden"
          >
            <div className="border-b theme-border px-6 py-5">
              <p className="text-sm font-medium theme-title">
                {hasExistingSubmission ? "Edit submitted work" : "Submit activity work"}
              </p>
              <h3 className="mt-1 text-xl font-bold text-[var(--app-text)]">{activity.title}</h3>
            </div>

            <div className="space-y-4 p-6">
              {isPreviewing ? (
                <div className="space-y-4 rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[var(--app-accent)]" />
                    <p className="text-sm font-semibold text-[var(--app-text)]">
                      Submission Preview
                    </p>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide theme-muted">Type</p>
                      <p className="mt-1 font-medium text-[var(--app-text)]">
                        {getSubmissionTypeLabel(activity.submissionType)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide theme-muted">Due</p>
                      <p className="mt-1 font-medium text-[var(--app-text)]">
                        {new Date(activity.dueDate).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {isEssay || isCode ? (
                    <div className="max-h-72 overflow-y-auto rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] p-3">
                      <p
                        className={[
                          "text-sm leading-6 text-[var(--app-text)]",
                          isCode ? "whitespace-pre font-mono" : "whitespace-pre-wrap",
                        ].join(" ")}
                      >
                        {trimmedEssay}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] p-3">
                      {isImage ? (
                        <ImageIcon className="h-5 w-5 text-[var(--app-accent)]" />
                      ) : (
                        <FileText className="h-5 w-5 text-[var(--app-accent)]" />
                      )}
                      <p className="text-sm font-medium text-[var(--app-text)]">
                        {trimmedFileName}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {activity.submissionType === "essay" ||
                  activity.submissionType === "code" ? (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm font-medium text-[var(--app-text)]">
                        {activity.submissionType === "code" && (
                          <Code2 className="h-4 w-4 text-[var(--app-accent)]" />
                        )}
                        {activity.submissionType === "code"
                          ? "Code Content"
                          : "Essay Content"}
                      </label>
                      <textarea
                        value={essayContent}
                        onChange={(event) => onChangeEssay(event.target.value)}
                        rows={activity.submissionType === "code" ? 10 : 7}
                        spellCheck={activity.submissionType !== "code"}
                        className={[
                          "theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 py-2 text-sm text-[var(--app-text)]",
                          activity.submissionType === "code" ? "font-mono" : "",
                        ].join(" ")}
                        placeholder={
                          activity.submissionType === "code"
                            ? "Paste or write your code here..."
                            : "Write your essay here..."
                        }
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-[var(--app-text)]">
                        Upload {getSubmissionTypeLabel(activity.submissionType)}
                      </label>
                      <Input
                        type="file"
                        accept={getAcceptedFileTypes(activity.submissionType)}
                        onChange={(event) => {
                          const selected = event.target.files?.[0];
                          onSelectFile(selected?.name ?? "");
                        }}
                        className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                      />
                      {fileName && (
                        <p className="text-xs theme-muted">Selected file: {fileName}</p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                {isPreviewing ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPreviewActivityId(null)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button onClick={onSubmit} disabled={isSubmitting}>
                      <Check className="mr-2 h-4 w-4" />
                      {isSubmitting
                        ? "Submitting..."
                        : hasExistingSubmission
                          ? "Submit Changes"
                          : "Submit Work"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={() => setPreviewActivityId(activity.id)}
                    disabled={!canPreview}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Work
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
