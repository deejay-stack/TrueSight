import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  FileText,
  Home,
  Loader2,
  Menu,
  Save,
  Upload,
  WandSparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { ActivityNotificationsPopover } from "../../components/ActivityNotificationsPopover";
import { useAuth } from "../../context/useAuth";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import {
  analyzeSingleSubmission,
  fetchDocumentPreview,
  fetchSubmissionDetail,
  fetchUserNotifications,
  saveSubmissionEvaluation,
  type ActivityNotification,
  type ClassSubmission,
  type PreviewDocument,
} from "./services/teacherClassroomService";
import {
  TeacherSidebar,
  type TeacherSection,
} from "./components/TeacherSidebar";
import { navigateBack } from "../../utils/navigation";
import {
  SUPPORT_SIDEBAR_ITEMS,
  SUPPORT_SIDEBAR_LABEL,
} from "../../utils/sidebarNavigation";

const SIDEBAR_ITEMS = [
  { key: "home", label: "Home", icon: Home },
  { key: "classes", label: "Classes", icon: BookOpen },
  { key: "uploads", label: "Uploads", icon: Upload },
  { key: "upcoming", label: "Upcoming", icon: CalendarClock },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isImageSubmission = (submission: ClassSubmission | null): boolean => {
  if (!submission) return false;
  return (
    submission.submissionType === "image" ||
    submission.fileType?.toLowerCase().startsWith("image/") === true
  );
};

const getImageVerdictTone = (prediction: string, aiProbability: number | null) => {
  if (prediction === "AI-generated") return "bg-[var(--heatmap-ai-bg)] text-[var(--heatmap-ai-text)]";
  if (prediction === "Human") return "bg-[var(--heatmap-human-bg)] text-[var(--heatmap-human-text)]";
  if (prediction === "Needs Review") {
    return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
  }
  if (typeof aiProbability === "number") {
    if (aiProbability >= 70) return "bg-[var(--heatmap-ai-bg)] text-[var(--heatmap-ai-text)]";
    if (aiProbability >= 40) {
      return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
    }
    return "bg-[var(--heatmap-human-bg)] text-[var(--heatmap-human-text)]";
  }
  return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
};

const getImageVerdictLabel = (prediction: string) => {
  if (prediction === "AI-generated") return "AI-generated";
  if (prediction === "Human") return "Human-created";
  if (prediction === "Needs Review") return "Suspicious / Unsure";
  return prediction;
};

export default function SubmissionDetailPage() {
  const navigate = useNavigate();
  const { submissionId } = useParams<{ submissionId: string }>();
  const { logout, darkMode } = useAuth();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submission, setSubmission] = useState<ClassSubmission | null>(null);
  const [imagePreview, setImagePreview] = useState<PreviewDocument | null>(null);
  const [isImagePreviewLoading, setIsImagePreviewLoading] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [evaluationForm, setEvaluationForm] = useState({
    comments: "",
    remarks: "",
    grade: "",
    score: "",
  });
  const [isSavingEvaluation, setIsSavingEvaluation] = useState(false);

  const loadSubmission = async () => {
    if (!submissionId) return;

    setLoading(true);
    try {
      const response = await fetchSubmissionDetail(submissionId);
      setSubmission(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load submission.";
      toast.error(message);
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    setIsLoadingNotifications(true);
    try {
      const payload = await fetchUserNotifications();
      setNotifications(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load notifications.";
      toast.error(message);
      setNotifications([]);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadSubmission(), loadNotifications()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  useEffect(() => {
    if (!submission) return;

    setEvaluationForm({
      comments: submission.teacherComments ?? "",
      remarks: submission.teacherRemarks ?? "",
      grade: submission.teacherGrade ?? "",
      score:
        submission.teacherScore === null ? "" : String(submission.teacherScore),
    });
  }, [submission]);

  useEffect(() => {
    let active = true;

    const loadImagePreview = async () => {
      if (!submission || !isImageSubmission(submission)) {
        setImagePreview(null);
        return;
      }

      setIsImagePreviewLoading(true);
      try {
        const preview = await fetchDocumentPreview("submission", submission.id);
        if (active) {
          setImagePreview(preview);
        }
      } catch {
        if (active) {
          setImagePreview(null);
        }
      } finally {
        if (active) {
          setIsImagePreviewLoading(false);
        }
      }
    };

    void loadImagePreview();

    return () => {
      active = false;
    };
  }, [submission]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore network issues on logout and proceed to auth screen.
    }

    navigate("/auth/login_screen", { replace: true });
  };

  const handleOpenNotification = (notification: ActivityNotification) => {
    setNotificationsOpen(false);

    if (notification.relatedSubmissionId) {
      navigate(`/teacher/submissions/${notification.relatedSubmissionId}`);
      return;
    }

    if (notification.activityId) {
      navigate(`/teacher/activities/${notification.activityId}`);
    }
  };

  const handleAnalyze = async () => {
    if (!submissionId || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeSingleSubmission(submissionId);
      const confidenceText =
        typeof result.confidenceScore === "number"
          ? ` (${result.confidenceScore.toFixed(2)}% confidence)`
          : "";
      toast.success(`Submission analyzed${confidenceText}.`);
      await loadSubmission();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze submission.";
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveEvaluation = async () => {
    if (!submission || isSavingEvaluation) return;

    const parsedScore =
      evaluationForm.score.trim() === "" ? null : Number(evaluationForm.score);

    if (
      parsedScore !== null &&
      (!Number.isFinite(parsedScore) ||
        parsedScore < 0 ||
        parsedScore > submission.maxScore)
    ) {
      toast.error(`Score must be between 0 and ${submission.maxScore}.`);
      return;
    }

    setIsSavingEvaluation(true);

    try {
      await saveSubmissionEvaluation(submission.id, {
        comments: evaluationForm.comments.trim(),
        remarks: evaluationForm.remarks.trim(),
        grade: evaluationForm.grade.trim(),
        score: parsedScore,
      });
      toast.success("Evaluation saved.");
      await loadSubmission();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save evaluation.";
      toast.error(message);
    } finally {
      setIsSavingEvaluation(false);
    }
  };

  const renderSubmissionContent = () => {
    if (!submission) return null;

    if (submission.contentText?.trim()) {
      return (
        <pre
          className={[
            "max-h-[360px] overflow-auto rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4 text-sm text-[var(--app-text)]",
            submission.submissionType === "code"
              ? "whitespace-pre font-mono"
              : "whitespace-pre-wrap",
          ].join(" ")}
        >
          {submission.contentText}
        </pre>
      );
    }

    return (
      <div className="rounded-xl border border-dashed theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4 text-sm theme-muted">
        No typed essay content is available for this submission.
      </div>
    );
  };

  const analysisDetails = isRecord(submission?.analysisDetails)
    ? submission.analysisDetails
    : null;
  const verdict =
    analysisDetails && typeof analysisDetails.verdict === "string"
      ? analysisDetails.verdict
      : "Not analyzed yet";
  const finalPrediction =
    analysisDetails && typeof analysisDetails.finalPrediction === "string"
      ? analysisDetails.finalPrediction
      : verdict;
  const analysisMessage =
    analysisDetails && typeof analysisDetails.message === "string"
      ? analysisDetails.message
      : null;
  const threshold =
    analysisDetails && typeof analysisDetails.threshold === "number"
      ? analysisDetails.threshold
      : null;

  return (
    <div
      className="role-theme-page h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle("teacher", darkMode)}
    >
      <TeacherSidebar
        items={[...SIDEBAR_ITEMS]}
        footerItems={[...SUPPORT_SIDEBAR_ITEMS]}
        footerLabel={SUPPORT_SIDEBAR_LABEL}
        activeSection={"classes" as TeacherSection}
        mobileOpen={mobileSidebarOpen}
        onSelect={(section) => navigate(`/teacher/teacher_screen/${section}`)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <header className="fixed left-0 right-0 top-0 z-10 h-16 border-b theme-border bg-[color-mix(in_srgb,var(--app-bg)_78%,transparent)] backdrop-blur-md md:left-20">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="theme-ring inline-flex h-10 w-10 items-center justify-center rounded-xl border theme-border text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs theme-muted">Teacher Panel</p>
              <p className="text-sm font-semibold text-[var(--app-text)]">
                Submission Detail
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <GlobalThemeToggle />
            <ActivityNotificationsPopover
              notifications={notifications}
              open={notificationsOpen}
              loading={isLoadingNotifications}
              onToggle={() => setNotificationsOpen((current) => !current)}
              onClose={() => setNotificationsOpen(false)}
              onRefresh={() => void loadNotifications()}
              onNotificationClick={handleOpenNotification}
            />
          </div>
        </div>
      </header>

      <main
        data-route-scroll-container
        className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto px-4 py-6 pb-10 sm:px-6 md:left-20"
      >
        <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigateBack(navigate, "/teacher/teacher_screen/classes")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Button>
          {submissionId && (
            <Button
              variant="outline"
              onClick={() => navigate(`/teacher/submissions/${submissionId}/analysis`)}
            >
              Open Analysis Report
            </Button>
          )}
          {submissionId && (
            <Button
              variant="outline"
              onClick={() => navigate(`/documents/submission/${submissionId}`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Preview Submission
            </Button>
          )}
          <Button onClick={() => void handleAnalyze()} disabled={isAnalyzing || !submissionId}>
            {isAnalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="mr-2 h-4 w-4" />
            )}
            {isAnalyzing ? "Analyzing..." : "Analyze Submission"}
          </Button>
        </div>

        {isAnalyzing && (
          <Card className="theme-card">
            <CardContent className="flex items-start gap-3 p-5">
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[var(--app-accent)]" />
              <div>
                <p className="font-semibold text-[var(--app-text)]">
                  Analyzing your submission...
                </p>
                <p className="mt-1 text-sm theme-muted">
                  Please wait while we process the file and check content using
                  the detection model.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card className="theme-card">
            <CardContent className="p-6 text-sm theme-muted">Loading submission...</CardContent>
          </Card>
        ) : !submission ? (
          <Card className="theme-card">
            <CardContent className="p-6 text-sm theme-muted">
              Submission not found or access denied.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="theme-card">
              <CardContent className="space-y-3 p-5">
                <h2 className="text-2xl font-bold text-[var(--app-text)]">
                  {submission.activityTitle}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Student</p>
                    <p className="font-semibold text-[var(--app-text)]">{submission.studentName}</p>
                    <p className="text-xs theme-muted">{submission.studentEmail}</p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Class</p>
                    <p className="font-semibold text-[var(--app-text)]">
                      {submission.className ?? "Class"}
                    </p>
                    <p className="text-xs theme-muted">ID: {submission.classId ?? "N/A"}</p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Status</p>
                    <p className="font-semibold text-[var(--app-text)]">{submission.status}</p>
                    <p className="text-xs theme-muted">
                      Submitted: {new Date(submission.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Submission Type</p>
                    <p className="font-semibold text-[var(--app-text)]">{submission.submissionType}</p>
                    <p className="text-xs theme-muted">
                      Due: {new Date(submission.dueDate).toLocaleString()}
                    </p>
                    <p className="text-xs theme-muted">
                      Max score: {submission.maxScore}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="theme-card">
              <CardContent className="space-y-3 p-5">
                <h3 className="text-lg font-semibold text-[var(--app-text)]">Submission Content</h3>
                {submission.fileName && (
                  <button
                    type="button"
                    onClick={() => navigate(`/documents/submission/${submission.id}`)}
                    className="theme-ring inline-flex items-center gap-2 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-3 py-2 text-sm text-[var(--app-text)] transition hover:border-[var(--app-accent)]"
                  >
                    <FileText className="h-4 w-4 text-[var(--app-accent)]" />
                    {submission.fileName}
                  </button>
                )}
                {renderSubmissionContent()}
              </CardContent>
            </Card>

            {isImageSubmission(submission) && (
              <Card className="theme-card">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--app-text)]">
                        Image Detection Preview
                      </h3>
                      <p className="text-sm theme-muted">
                        Uploaded image and model result for visual review.
                      </p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        getImageVerdictTone(finalPrediction, submission.aiProbability),
                      ].join(" ")}
                    >
                      {getImageVerdictLabel(finalPrediction)}
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(240px,430px)_1fr] lg:items-center">
                    <div className="overflow-hidden rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-bg)_72%,black)]">
                      {isImagePreviewLoading ? (
                        <div className="flex aspect-video items-center justify-center text-sm theme-muted">
                          Loading image preview...
                        </div>
                      ) : imagePreview?.dataUrl || submission.fileDataUrl ? (
                        <img
                          src={imagePreview?.dataUrl ?? submission.fileDataUrl ?? ""}
                          alt={imagePreview?.fileName ?? submission.fileName ?? "Analyzed image"}
                          className="max-h-[360px] w-full object-contain"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center p-5 text-center text-sm theme-muted">
                          Image preview is unavailable. Open the full preview to inspect the file.
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                        <p className="text-xs theme-muted">Verdict</p>
                        <p className="text-lg font-bold text-[var(--app-text)]">
                          {getImageVerdictLabel(finalPrediction)}
                        </p>
                      </div>
                      <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                        <p className="text-xs theme-muted">Confidence</p>
                        <p className="text-lg font-bold text-[var(--app-text)]">
                          {typeof submission.confidenceScore === "number"
                            ? `${submission.confidenceScore.toFixed(2)}%`
                            : "N/A"}
                        </p>
                      </div>
                      <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                        <p className="text-xs theme-muted">AI probability</p>
                        <p className="text-lg font-bold text-[var(--app-text)]">
                          {typeof submission.aiProbability === "number"
                            ? `${submission.aiProbability.toFixed(2)}%`
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="theme-card">
              <CardContent className="space-y-3 p-5">
                <h3 className="text-lg font-semibold text-[var(--app-text)]">Analysis Snapshot</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Prediction</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {finalPrediction === "AI-generated"
                        ? "Likely AI-generated"
                        : finalPrediction === "Human"
                          ? "Likely Human-created"
                          : finalPrediction}
                    </p>
                    {threshold !== null && (
                      <p className="mt-1 text-xs theme-muted">
                        Threshold: {(threshold * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">AI Probability</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {typeof submission.aiProbability === "number"
                        ? `${submission.aiProbability.toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Human Probability</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {typeof submission.humanProbability === "number"
                        ? `${submission.humanProbability.toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                    <p className="text-xs theme-muted">Confidence Score</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {typeof submission.confidenceScore === "number"
                        ? `${submission.confidenceScore.toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                  <p className="text-xs theme-muted">Verdict</p>
                  <p className="font-semibold text-[var(--app-text)]">{verdict}</p>
                  {analysisMessage && (
                    <p className="mt-2 text-sm theme-muted">{analysisMessage}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="theme-card">
              <CardContent className="space-y-4 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--app-text)]">
                    Teacher Evaluation
                  </h3>
                  <p className="text-sm theme-muted">
                    Save academic feedback separately from AI detection results.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide theme-muted">
                      Score
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={submission.maxScore}
                      step="0.01"
                      value={evaluationForm.score}
                      onChange={(event) =>
                        setEvaluationForm((previous) => ({
                          ...previous,
                          score: event.target.value,
                        }))
                      }
                      placeholder={`0-${submission.maxScore}`}
                      className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide theme-muted">
                      Grade
                    </label>
                    <Input
                      value={evaluationForm.grade}
                      onChange={(event) =>
                        setEvaluationForm((previous) => ({
                          ...previous,
                          grade: event.target.value,
                        }))
                      }
                      placeholder="e.g. 85%"
                      className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide theme-muted">
                      Remarks
                    </label>
                    <Input
                      value={evaluationForm.remarks}
                      onChange={(event) =>
                        setEvaluationForm((previous) => ({
                          ...previous,
                          remarks: event.target.value,
                        }))
                      }
                      placeholder="Needs Revision"
                      className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide theme-muted">
                    Comments
                  </label>
                  <textarea
                    value={evaluationForm.comments}
                    onChange={(event) =>
                      setEvaluationForm((previous) => ({
                        ...previous,
                        comments: event.target.value,
                      }))
                    }
                    rows={5}
                    placeholder="Write teacher feedback for the student..."
                    className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 py-2 text-sm leading-6 text-[var(--app-text)]"
                  />
                </div>

                {submission.evaluatedAt && (
                  <p className="text-xs theme-muted">
                    Last reviewed {new Date(submission.evaluatedAt).toLocaleString()}
                  </p>
                )}

                <Button
                  onClick={() => void handleSaveEvaluation()}
                  disabled={isSavingEvaluation}
                >
                  {isSavingEvaluation ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isSavingEvaluation ? "Saving..." : "Save Evaluation"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
