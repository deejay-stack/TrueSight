import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Code2,
  FileText,
  History,
  Send,
} from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import { useAuth } from "../../context/useAuth";
import {
  fetchActivityDetail,
  type ActivityDetail,
} from "./services/studentClassroomService";
import { useNetworkStatus } from "../../context/NetworkStatusContext";
import { formatFileSize } from "../../utils/documentPreview";
import { navigateBack } from "../../utils/navigation";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not available";
};

const getDueState = (dueDate: string, submitted: boolean) => {
  if (submitted) {
    return "Submitted";
  }

  return new Date(dueDate).getTime() < Date.now() ? "Overdue" : "Open";
};

const getSubmissionTypeLabel = (type: string) => {
  if (type === "code") return "Code";
  if (type === "image") return "Image";
  if (type === "file") return "File";
  return "Essay";
};

export default function StudentActivityDetailsPage() {
  const navigate = useNavigate();
  const { activityId } = useParams<{
    activityId: string;
  }>();
  const { online } = useNetworkStatus();
  const { darkMode } = useAuth();

  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const activity = detail?.activity ?? null;
  const submission = detail?.mySubmission ?? null;
  const history = detail?.history ?? [];

  const dueState = useMemo(
    () => (activity ? getDueState(activity.dueDate, Boolean(submission)) : "Open"),
    [activity, submission],
  );

  useEffect(() => {
    let active = true;

    const loadDetail = async () => {
      if (!activityId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const payload = await fetchActivityDetail(activityId);

        if (active) {
          setDetail(payload);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load activity.";
        toast.error(message);
        setDetail(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      active = false;
    };
  }, [activityId]);

  return (
    <div
      className="role-theme-page h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle("student", darkMode)}
    >
      <header className="fixed left-0 right-0 top-0 z-20 h-16 border-b theme-border bg-[color-mix(in_srgb,var(--app-bg)_72%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Button
            variant="outline"
            onClick={() => navigateBack(navigate, "/student/student_screen")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
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
            <CardContent className="p-6 text-sm theme-muted">Loading activity...</CardContent>
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
            className="space-y-5"
          >
            <Card className="theme-card overflow-hidden">
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="theme-muted text-xs uppercase tracking-wide">
                      {activity.className ?? "Class Activity"}
                    </p>
                    <h1 className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                      {activity.title}
                    </h1>
                    <p className="mt-2 text-sm theme-muted">
                      Instructor: {activity.instructor}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border theme-border bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--app-accent)]">
                      {getSubmissionTypeLabel(activity.submissionType)} activity
                    </span>
                    <span className="rounded-full border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--app-text)]">
                      {dueState}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                    <CalendarClock className="mb-2 h-4 w-4 text-[var(--app-accent)]" />
                    <p className="text-xs theme-muted">Due Date</p>
                    <p className="mt-1 font-medium text-[var(--app-text)]">
                      {formatDateTime(activity.dueDate)}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                    <Clock3 className="mb-2 h-4 w-4 text-[var(--app-accent)]" />
                    <p className="text-xs theme-muted">Submission Status</p>
                    <p className="mt-1 font-medium text-[var(--app-text)]">
                      {submission ? submission.status : "Not submitted"}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                    <CheckCircle2 className="mb-2 h-4 w-4 text-[var(--app-accent)]" />
                    <p className="text-xs theme-muted">Resubmission</p>
                    <p className="mt-1 font-medium text-[var(--app-text)]">
                      {activity.allowResubmission ? "Allowed" : "Locked after submit"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs theme-muted">
                  <span className="rounded-full border theme-border px-3 py-1">
                    {activity.maxScore} pts
                  </span>
                  {activity.submissionType === "code" &&
                    activity.programmingLanguage && (
                      <span className="rounded-full border theme-border px-3 py-1">
                        {activity.programmingLanguage}
                      </span>
                    )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <div className="space-y-5">
                <Card className="theme-card">
                  <CardContent className="space-y-3 p-5">
                    <h2 className="text-lg font-semibold text-[var(--app-text)]">
                      Instructions
                    </h2>
                    <p className="whitespace-pre-wrap text-sm leading-6 theme-muted">
                      {activity.description}
                    </p>
                    {activity.submissionType === "code" && activity.starterCode && (
                      <div className="mt-4 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                          <Code2 className="h-4 w-4 text-[var(--app-accent)]" />
                          Starter Code
                        </div>
                        <pre className="max-h-72 overflow-auto whitespace-pre rounded-lg bg-[color-mix(in_srgb,var(--app-bg)_72%,black)] p-3 font-mono text-xs leading-5 text-[var(--app-text)]">
                          {activity.starterCode}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="theme-card">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[var(--app-accent)]" />
                      <h2 className="text-lg font-semibold text-[var(--app-text)]">
                        Submission History
                      </h2>
                    </div>
                    {history.length === 0 ? (
                      <p className="text-sm theme-muted">No submissions yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((entry) => (
                          <div
                            key={`${entry.id}-${entry.version}`}
                            className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-medium text-[var(--app-text)]">
                                  Version {entry.version}
                                </p>
                                <p className="text-xs theme-muted">
                                  {formatDateTime(entry.submittedAt)}
                                </p>
                              </div>
                              <span className="rounded-full bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] px-2 py-1 text-xs text-[var(--app-accent)]">
                                {entry.status}
                              </span>
                            </div>
                            {entry.fileName && (
                              <p className="mt-2 text-xs theme-muted">
                                {entry.fileName} - {formatFileSize(entry.fileSize)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-5">
                <Card className="theme-card">
                  <CardContent className="space-y-3 p-5">
                    <h2 className="text-lg font-semibold text-[var(--app-text)]">
                      Teacher Files
                    </h2>
                    {activity.attachment ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/documents/activity-attachment/${activity.id}`)
                        }
                        className="theme-ring flex w-full items-center gap-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3 text-left transition hover:border-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]"
                      >
                        <FileText className="h-5 w-5 text-[var(--app-accent)]" />
                        <span>
                          <span className="block text-sm font-medium text-[var(--app-text)]">
                            {activity.attachment.fileName}
                          </span>
                          <span className="block text-xs theme-muted">
                            {formatFileSize(activity.attachment.fileSize)}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <p className="text-sm theme-muted">No attached files.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="theme-card">
                  <CardContent className="space-y-3 p-5">
                    <h2 className="text-lg font-semibold text-[var(--app-text)]">
                      Current Submission
                    </h2>
                    {submission ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3 text-sm">
                          <p className="font-medium text-[var(--app-text)]">
                            Version {submission.submittedVersion}
                          </p>
                          <p className="mt-1 theme-muted">
                            Submitted {formatDateTime(submission.submittedAt)}
                          </p>
                          {submission.fileName && (
                            <p className="mt-1 theme-muted">
                              {submission.fileName} - {formatFileSize(submission.fileSize)}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => navigate(`/documents/submission/${submission.id}`)}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Preview Submission
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm theme-muted">No work submitted yet.</p>
                    )}
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (!online) {
                          toast.error("Internet access is required to submit activity work.");
                          return;
                        }

                        navigate(`/student/activities/${activity.id}/submit`);
                      }}
                      disabled={(Boolean(submission) && !activity.allowResubmission) || !online}
                      title={!online ? "Internet access is required." : undefined}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {submission ? "Manage Submission" : "Submit Activity"}
                    </Button>
                  </CardContent>
                </Card>

                {submission && (
                  <Card className="theme-card">
                    <CardContent className="space-y-3 p-5">
                      <h2 className="text-lg font-semibold text-[var(--app-text)]">
                        AI Detection Result
                      </h2>
                      <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3 text-sm">
                        <p className="font-medium text-[var(--app-text)]">
                          {typeof submission.aiProbability === "number"
                            ? `${submission.aiProbability.toFixed(2)}% probability of AI-generated content`
                            : "Not analyzed yet"}
                        </p>
                        {typeof submission.confidenceScore === "number" && (
                          <p className="mt-1 theme-muted">
                            Confidence: {submission.confidenceScore.toFixed(2)}%
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {submission && (
                  <Card className="theme-card">
                    <CardContent className="space-y-3 p-5">
                      <h2 className="text-lg font-semibold text-[var(--app-text)]">
                        Teacher Evaluation
                      </h2>
                      {submission.evaluatedAt ? (
                        <div className="space-y-3 text-sm">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                              <p className="text-xs theme-muted">Score</p>
                              <p className="font-semibold text-[var(--app-text)]">
                                {submission.teacherScore !== null
                                  ? `${submission.teacherScore}/${activity.maxScore}`
                                  : "Not scored"}
                              </p>
                            </div>
                            <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                              <p className="text-xs theme-muted">Grade</p>
                              <p className="font-semibold text-[var(--app-text)]">
                                {submission.teacherGrade ?? "Not set"}
                              </p>
                            </div>
                          </div>
                          <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                            <p className="text-xs theme-muted">Remarks</p>
                            <p className="font-semibold text-[var(--app-text)]">
                              {submission.teacherRemarks ?? "No remarks"}
                            </p>
                          </div>
                          <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                            <p className="text-xs theme-muted">Teacher Comments</p>
                            <p className="mt-1 whitespace-pre-wrap text-[var(--app-text)]">
                              {submission.teacherComments ?? "No comments"}
                            </p>
                            <p className="mt-3 text-xs theme-muted">
                              Reviewed {formatDateTime(submission.evaluatedAt)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm theme-muted">
                          No teacher evaluation has been saved yet.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </motion.div>
        )}
        </div>
      </main>
    </div>
  );
}
