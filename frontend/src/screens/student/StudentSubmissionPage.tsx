import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Play,
  Send,
  Terminal,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import { useAuth } from "../../context/useAuth";
import {
  fetchActivityDetail,
  submitActivitySubmission,
  unsubmitActivitySubmission,
  type ActivityDetail,
} from "./services/studentClassroomService";
import { useNetworkStatus } from "../../context/NetworkStatusContext";
import {
  formatFileSize,
  prepareFileUpload,
  saveDraftDocument,
  type PreparedFileUpload,
} from "../../utils/documentPreview";
import { navigateBack } from "../../utils/navigation";
import { CodeEditor } from "../../components/code/CodeEditor";
import {
  getProgrammingLanguageLabel,
  runCode,
} from "../../utils/codeRunner";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not available";
};

const getSubmissionTypeLabel = (type: string) => {
  if (type === "code") return "Code";
  if (type === "image") return "Image";
  if (type === "file") return "File";
  return "Essay";
};

const getAcceptedFileTypes = (type: string) =>
  type === "image" ? ".png,.jpg,.jpeg,.webp" : ".pdf,.docx";

const getUploadHelpText = (type: string) =>
  type === "image"
    ? "PNG, JPG, JPEG, or WEBP images up to 5 MB."
    : "PDF or DOCX documents up to 5 MB.";

export default function StudentSubmissionPage() {
  const navigate = useNavigate();
  const { activityId } = useParams<{ activityId: string }>();
  const { online } = useNetworkStatus();
  const { darkMode } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [essayContent, setEssayContent] = useState("");
  const [preparedUpload, setPreparedUpload] = useState<PreparedFileUpload | null>(null);
  const [draftPreviewId, setDraftPreviewId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [serverUploadProgress, setServerUploadProgress] = useState(0);
  const [submissionStatusText, setSubmissionStatusText] = useState("");
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnsubmitting, setIsUnsubmitting] = useState(false);
  const [unsubmitDialogOpen, setUnsubmitDialogOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeOutput, setCodeOutput] = useState("");
  const [codeRunSummary, setCodeRunSummary] = useState("");
  const [isRunningCode, setIsRunningCode] = useState(false);

  const activity = detail?.activity ?? null;
  const submission = detail?.mySubmission ?? null;
  const locked = Boolean(submission) && activity?.allowResubmission === false;
  const hasUploadPayload =
    activity?.submissionType === "file" || activity?.submissionType === "image";

  const loadDetail = async () => {
    if (!activityId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchActivityDetail(activityId);
      setDetail(payload);
      setEssayContent(
        payload.mySubmission?.contentText ??
          (payload.activity.submissionType === "code"
            ? payload.activity.starterCode ?? ""
            : ""),
      );
      setCodeInput("");
      setCodeOutput("");
      setCodeRunSummary("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load activity.";
      toast.error(message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const prepareSelectedFile = async (file: File | undefined) => {
    if (!online) {
      toast.error("Internet access is required to upload files.");
      return;
    }

    if (!file || !activity) {
      return;
    }

    setIsPreparingFile(true);
    setUploadProgress(0);

    try {
      const upload = await prepareFileUpload(
        file,
        setUploadProgress,
        activity.submissionType === "image"
          ? "image-submission"
          : "file-submission",
      );
      const previewId = saveDraftDocument(
        upload,
        activity.title,
        activity.className,
      );

      setPreparedUpload(upload);
      setDraftPreviewId(previewId);
      toast.success(
        activity.submissionType === "image"
          ? "Image ready for preview."
          : "File ready for preview.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare file.";
      toast.error(message);
      setPreparedUpload(null);
      setDraftPreviewId(null);
      setUploadProgress(0);
    } finally {
      setIsPreparingFile(false);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void prepareSelectedFile(event.target.files?.[0]);
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
    void prepareSelectedFile(event.dataTransfer.files?.[0]);
  };

  const handleCodeChange = (value: string) => {
    setEssayContent(value);
    setCodeOutput("");
    setCodeRunSummary("");
  };

  const handleRunCode = async () => {
    if (!activity || activity.submissionType !== "code" || !essayContent.trim()) {
      return;
    }
    if (!online) {
      toast.error("Internet access is required to run code.");
      return;
    }

    setIsRunningCode(true);
    setCodeOutput("Sending program to the compiler...");
    setCodeRunSummary("");

    try {
      const result = await runCode(
        essayContent,
        activity.programmingLanguage,
        codeInput,
      );
      setCodeOutput(result.output);
      setCodeRunSummary(
        [
          result.status,
          result.runtime,
          result.executionTime ? `${result.executionTime}s` : "",
          typeof result.memory === "number"
            ? `${Math.round(result.memory / 1024)} MB`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } finally {
      setIsRunningCode(false);
    }
  };

  const handleSubmit = async () => {
    if (!online) {
      toast.error("Internet access is required to submit work.");
      return;
    }

    if (!activity || !activityId || locked) {
      return;
    }

    if (
      (activity.submissionType === "essay" || activity.submissionType === "code") &&
      !essayContent.trim()
    ) {
      toast.error(
        activity.submissionType === "code"
          ? "Code submission requires code content."
          : "Essay submission requires text content.",
      );
      return;
    }

    if (activity.submissionType === "file" && !preparedUpload) {
      toast.error("Please upload a PDF or DOCX document first.");
      return;
    }

    if (activity.submissionType === "image" && !preparedUpload) {
      toast.error("Please upload a supported image first.");
      return;
    }

    setIsSubmitting(true);
    setServerUploadProgress(hasUploadPayload ? 0 : 100);
    setSubmissionStatusText(
      !hasUploadPayload
        ? "Analyzing your submission..."
        : "Uploading... 0%",
    );

    try {
      await submitActivitySubmission(
        activityId,
        {
          contentText:
            activity.submissionType === "essay"
              ? essayContent.trim()
              : activity.submissionType === "code"
                ? essayContent
              : undefined,
          fileName:
            !hasUploadPayload ? undefined : preparedUpload?.fileName,
          fileType:
            !hasUploadPayload ? undefined : preparedUpload?.fileType,
          fileSize:
            !hasUploadPayload ? undefined : preparedUpload?.fileSize,
          fileDataUrl:
            !hasUploadPayload ? undefined : preparedUpload?.fileDataUrl,
        },
        hasUploadPayload
          ? {
              onUploadProgress: (progress) => {
                setServerUploadProgress(progress);
                setSubmissionStatusText(
                  progress >= 100
                    ? "Upload complete. Analyzing..."
                    : `Uploading... ${progress}%`,
                );
              },
            }
          : undefined,
      );

      toast.success(submission ? "Submission updated." : "Submission saved.");
      navigate(`/student/classes/${activity.classId}/activities/${activity.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit work.";
      setSubmissionStatusText("Submission failed. Please try again.");
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setServerUploadProgress(0);
    }
  };

  const handleConfirmUnsubmit = async () => {
    if (!online) {
      toast.error("Internet access is required to unsubmit work.");
      return;
    }

    if (!activity || !activityId || !submission || locked || isUnsubmitting) {
      return;
    }

    setIsUnsubmitting(true);
    try {
      await unsubmitActivitySubmission(activityId);
      toast.success("Submission removed.");
      setUnsubmitDialogOpen(false);
      setPreparedUpload(null);
      setDraftPreviewId(null);
      await loadDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unsubmit work.";
      toast.error(message);
    } finally {
      setIsUnsubmitting(false);
    }
  };

  return (
    <div
      className="role-theme-page h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle("student", darkMode)}
    >
      <header className="fixed left-0 right-0 top-0 z-20 h-16 border-b theme-border bg-[color-mix(in_srgb,var(--app-bg)_72%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Button
            variant="outline"
            onClick={() =>
              navigateBack(
                navigate,
                activity
                  ? `/student/classes/${activity.classId}/activities/${activity.id}`
                  : "/student/student_screen",
              )
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Activity
          </Button>
          <GlobalThemeToggle className="h-10 w-10" />
        </div>
      </header>

      <main
        data-route-scroll-container
        className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto px-4 py-6 pb-10 sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
        {loading ? (
          <Card className="theme-card">
            <CardContent className="flex items-center gap-3 p-6 text-sm theme-muted">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--app-accent)]" />
              Loading submission workspace...
            </CardContent>
          </Card>
        ) : !activity ? (
          <Card className="theme-card">
            <CardContent className="p-6 text-sm theme-muted">
              Activity not found or access denied.
            </CardContent>
          </Card>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-5 lg:grid-cols-[1fr_340px]"
          >
            <div className="space-y-5">
              <Card className="theme-card">
                <CardContent className="space-y-2 p-5">
                  <p className="theme-muted text-xs uppercase tracking-wide">
                    Submit Activity
                  </p>
                  <h1 className="text-3xl font-bold text-[var(--app-text)]">
                    {activity.title}
                  </h1>
                  <p className="text-sm theme-muted">
                    Due {formatDateTime(activity.dueDate)}
                  </p>
                  {!online && (
                    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                      You can review this activity while offline, but uploads and submissions are disabled.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="theme-card">
                <CardContent className="space-y-4 p-5">
                  {activity.submissionType === "code" ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                          <Code2 className="h-4 w-4 text-[var(--app-accent)]" />
                          {getProgrammingLanguageLabel(activity.programmingLanguage)} Submission
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRunCode()}
                            disabled={isRunningCode || !online || !essayContent.trim()}
                          >
                            {isRunningCode ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            {isRunningCode ? "Running..." : "Run Code"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSubmit()}
                            disabled={isSubmitting || locked || !online || !essayContent.trim()}
                          >
                            {isSubmitting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            {isSubmitting
                              ? "Submitting..."
                              : submission
                                ? "Submit Changes"
                                : "Submit Activity"}
                          </Button>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--app-surface)_86%,transparent)]">
                        <div className="flex items-center justify-between border-b theme-border px-4 py-2 text-xs theme-muted">
                          <span>{getProgrammingLanguageLabel(activity.programmingLanguage)}</span>
                          <span>{essayContent.split("\n").length} lines</span>
                        </div>
                        <CodeEditor
                          value={essayContent}
                          language={activity.programmingLanguage}
                          onChange={handleCodeChange}
                          readOnly={locked}
                          minHeight={460}
                          darkMode={darkMode}
                          ariaLabel={`${getProgrammingLanguageLabel(activity.programmingLanguage)} submission editor`}
                        />
                      </div>

                      <p className="text-xs theme-muted">
                        Brackets and parentheses close automatically. Use Tab to indent and Ctrl+Space to open code suggestions.
                      </p>

                      <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase theme-muted">
                            Standard Input
                          </label>
                          <textarea
                            value={codeInput}
                            onChange={(event) => setCodeInput(event.target.value)}
                            rows={5}
                            spellCheck={false}
                            placeholder="Optional input passed to the program"
                            className="theme-ring h-36 w-full resize-none rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_94%,transparent)] px-3 py-2 font-mono text-sm leading-6 text-[var(--app-text)]"
                          />
                        </div>
                        <div className="overflow-hidden rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-bg)_78%,black)]">
                          <div className="flex h-9 items-center gap-2 border-b theme-border px-3 text-xs font-semibold text-[var(--app-text)]">
                            <Terminal className="h-4 w-4 text-[var(--app-accent)]" />
                            Program Output
                            {codeRunSummary && (
                              <span className="ml-auto truncate font-normal theme-muted">
                                {codeRunSummary}
                              </span>
                            )}
                          </div>
                          <pre className="h-[106px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-sm leading-6 text-[var(--app-text)]">
                            {codeOutput || "Run your code to inspect compiler and program output."}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : activity.submissionType === "essay" ? (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                        Essay Content
                      </label>
                      <textarea
                        value={essayContent}
                        onChange={(event) => setEssayContent(event.target.value)}
                        rows={14}
                        disabled={locked}
                        spellCheck={true}
                        className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_86%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Write your response here..."
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <input
                        ref={inputRef}
                        type="file"
                        accept={getAcceptedFileTypes(activity.submissionType)}
                        className="hidden"
                        disabled={!online || isPreparingFile || isSubmitting}
                        onChange={handleFileInput}
                      />
                      <button
                        type="button"
                        disabled={locked || !online || isPreparingFile || isSubmitting}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={[
                          "theme-ring flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center transition-all",
                          dragActive
                            ? "border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)]"
                            : "theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] hover:border-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)]",
                          locked || isPreparingFile || isSubmitting
                            ? "cursor-not-allowed opacity-60"
                            : "",
                        ].join(" ")}
                      >
                        {activity.submissionType === "image" ? (
                          <ImageIcon className="h-10 w-10 text-[var(--app-accent)]" />
                        ) : (
                          <UploadCloud className="h-10 w-10 text-[var(--app-accent)]" />
                        )}
                        <p className="mt-3 font-semibold text-[var(--app-text)]">
                          Drop your {getSubmissionTypeLabel(activity.submissionType).toLowerCase()} here
                        </p>
                        <p className="mt-1 max-w-sm text-sm theme-muted">
                          {getUploadHelpText(activity.submissionType)}
                        </p>
                      </button>

                      {isPreparingFile && (
                        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                          <div className="mb-2 flex items-center justify-between text-xs theme-muted">
                            <span>Preparing preview</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_20%,transparent)]">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {preparedUpload && (
                        <div className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              {activity.submissionType === "image" ? (
                                <ImageIcon className="h-5 w-5 text-[var(--app-accent)]" />
                              ) : (
                                <FileUp className="h-5 w-5 text-[var(--app-accent)]" />
                              )}
                              <div>
                                <p className="font-medium text-[var(--app-text)]">
                                  {preparedUpload.fileName}
                                </p>
                                <p className="text-xs theme-muted">
                                  {formatFileSize(preparedUpload.fileSize)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {draftPreviewId && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/documents/draft/${draftPreviewId}`)}
                                >
                                  Preview
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setPreparedUpload(null);
                                  setDraftPreviewId(null);
                                  setUploadProgress(0);
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-5">
              <Card className="theme-card">
                <CardContent className="space-y-3 p-5">
                  <h2 className="text-lg font-semibold text-[var(--app-text)]">
                    Status
                  </h2>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[var(--app-accent)]" />
                      <p className="font-medium text-[var(--app-text)]">
                        {submission ? submission.status : "Not submitted"}
                      </p>
                    </div>
                    <p className="mt-2 text-xs theme-muted">
                      {submission
                        ? `Submitted ${formatDateTime(submission.submittedAt)}`
                        : "No submission timestamp yet."}
                    </p>
                    {submission?.fileName && (
                      <p className="mt-2 text-xs theme-muted">
                        {submission.fileName} - {formatFileSize(submission.fileSize)}
                      </p>
                    )}
                  </div>

                  {submission && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => navigate(`/documents/submission/${submission.id}`)}
                    >
                      Preview Submitted Work
                    </Button>
                  )}
                </CardContent>
              </Card>

              {locked && (
                <Card className="theme-card">
                  <CardContent className="p-5 text-sm theme-muted">
                    This activity is locked because the teacher disabled resubmissions.
                  </CardContent>
                </Card>
              )}

              <Card className="theme-card">
                <CardContent className="space-y-3 p-5">
                  {isSubmitting && (
                    <div className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))] p-4">
                      <div className="flex items-start gap-3">
                        <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[var(--app-accent)]" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--app-text)]">
                            {submissionStatusText ||
                              "Analyzing your submission..."}
                          </p>
                          <p className="mt-1 text-sm theme-muted">
                            Please wait while we process the file and check
                            content using the detection model.
                          </p>
                        </div>
                      </div>
                      {hasUploadPayload && (
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-xs theme-muted">
                            <span>
                              {serverUploadProgress >= 100
                                ? "Upload complete"
                                : "Uploading"}
                            </span>
                            <span>{serverUploadProgress}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_20%,transparent)]">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] transition-all duration-300"
                              style={{ width: `${serverUploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => void handleSubmit()}
                    disabled={isSubmitting || isPreparingFile || locked || !online}
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {isSubmitting
                      ? hasUploadPayload
                        ? "Uploading and Analyzing..."
                        : "Analyzing..."
                      : submission
                        ? "Submit Changes"
                        : "Submit Work"}
                  </Button>
                  {submission && (
                    <AlertDialog
                      open={unsubmitDialogOpen}
                      onOpenChange={(open) => {
                        if (!isUnsubmitting) {
                          setUnsubmitDialogOpen(open);
                        }
                      }}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          className="w-full"
                          variant="destructive"
                          disabled={isUnsubmitting || locked || !online}
                        >
                          {isUnsubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Unsubmit Work
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="theme-card border theme-border bg-[var(--app-surface)] text-[var(--app-text)]">
                        <AlertDialogHeader className="items-center text-center sm:items-start sm:text-left">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
                            <AlertTriangle className="h-6 w-6" />
                          </div>
                          <AlertDialogTitle>
                            Are you sure you want to unsubmit?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="theme-muted">
                            This will remove your current submitted work for{" "}
                            <span className="font-medium text-[var(--app-text)]">
                              {activity.title}
                            </span>
                            . You can submit again only if this activity still allows
                            resubmission.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3 text-sm">
                          <p className="font-medium text-[var(--app-text)]">
                            Version {submission.submittedVersion}
                          </p>
                          <p className="mt-1 theme-muted">
                            Submitted {formatDateTime(submission.submittedAt)}
                          </p>
                          {submission.fileName && (
                            <p className="mt-1 theme-muted">
                              {submission.fileName} -{" "}
                              {formatFileSize(submission.fileSize)}
                            </p>
                          )}
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isUnsubmitting}>
                            Keep Submission
                          </AlertDialogCancel>
                          <AlertDialogAction
                            disabled={isUnsubmitting}
                            onClick={(event) => {
                              event.preventDefault();
                              void handleConfirmUnsubmit();
                            }}
                            className="bg-rose-600 text-white hover:bg-rose-700"
                          >
                            {isUnsubmitting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Yes, Unsubmit
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardContent>
              </Card>
            </aside>
          </motion.div>
        )}
        </div>
      </main>
    </div>
  );
}
