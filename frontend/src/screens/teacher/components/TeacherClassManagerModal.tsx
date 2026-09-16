import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  Code2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { formatFileSize } from "../../../utils/documentPreview";
import type {
  ActivitySubmissionType,
  ClassActivity,
  ClassSubmission,
  EnrolledStudent,
  TeacherClass,
} from "../services/teacherClassroomService";

type ActivityFormState = {
  title: string;
  instructor: string;
  description: string;
  submissionType: ActivitySubmissionType;
  allowResubmission: boolean;
  maxScore: number;
  programmingLanguage: string;
  starterCode: string;
  attachmentName: string;
  attachmentType: string;
  attachmentSize: number;
  attachmentDataUrl: string;
  dueDate: string;
};

type TeacherClassManagerModalProps = {
  open: boolean;
  classroom: TeacherClass | null;
  loading: boolean;
  activities: ClassActivity[];
  students: EnrolledStudent[];
  submissions: ClassSubmission[];
  activityForm: ActivityFormState;
  isCreatingActivity: boolean;
  isPreparingAttachment: boolean;
  attachmentProgress: number;
  isAnalyzing: boolean;
  analyzingSubmissionId: string | null;
  expandedSubmissionId: string | null;
  focusedActivityId?: string | null;
  onClose: () => void;
  onAnalyzeAll: () => void;
  onAnalyzeSubmission: (submissionId: string) => void;
  onOpenSubmissionPage: (submissionId: string) => void;
  onOpenDocumentPreview: (submissionId: string) => void;
  onOpenAnalysisPage: (submissionId: string) => void;
  onSubmitActivity: (event: React.FormEvent) => void;
  onSelectAttachment: (file: File | undefined) => void;
  onClearAttachment: () => void;
  onChangeActivityForm: (patch: Partial<ActivityFormState>) => void;
  onToggleSubmission: (submissionId: string) => void;
};

const getSubmissionTypeLabel = (type: ActivitySubmissionType) => {
  if (type === "code") return "Code";
  if (type === "image") return "Images";
  if (type === "file") return "Files";
  return "Essays";
};

const PROGRAMMING_LANGUAGES = [
  "Java",
  "JavaScript",
  "Python",
  "Dart",
];

const getDisplayPrediction = (submission: ClassSubmission) => {
  const prediction =
    typeof submission.analysisDetails?.finalPrediction === "string"
      ? submission.analysisDetails.finalPrediction
      : null;

  if (prediction === "AI-generated") return "Likely AI-generated";
  if (prediction === "Human") return "Likely Human-created";
  if (prediction === "Needs Review") return "Needs Manual Review";

  return typeof submission.aiProbability === "number"
    ? `${submission.aiProbability.toFixed(2)}% AI probability`
    : "Not analyzed";
};

const isImageSubmission = (submission: ClassSubmission) =>
  submission.submissionType === "image" ||
  submission.fileType?.toLowerCase().startsWith("image/") === true;

const getVerdictToneClass = (submission: ClassSubmission) => {
  const prediction =
    typeof submission.analysisDetails?.finalPrediction === "string"
      ? submission.analysisDetails.finalPrediction
      : null;

  if (prediction === "AI-generated") {
    return "bg-[var(--heatmap-ai-bg)] text-[var(--heatmap-ai-text)]";
  }
  if (prediction === "Human") {
    return "bg-[var(--heatmap-human-bg)] text-[var(--heatmap-human-text)]";
  }
  if (prediction === "Needs Review") {
    return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
  }

  if (typeof submission.aiProbability === "number") {
    if (submission.aiProbability >= 70) {
      return "bg-[var(--heatmap-ai-bg)] text-[var(--heatmap-ai-text)]";
    }
    if (submission.aiProbability >= 40) {
      return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
    }
    return "bg-[var(--heatmap-human-bg)] text-[var(--heatmap-human-text)]";
  }

  return "bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)] text-[var(--app-text)]";
};

export function TeacherClassManagerModal({
  open,
  classroom,
  loading,
  activities,
  students,
  submissions,
  activityForm,
  isCreatingActivity,
  isPreparingAttachment,
  attachmentProgress,
  isAnalyzing,
  analyzingSubmissionId,
  expandedSubmissionId,
  focusedActivityId,
  onClose,
  onAnalyzeAll,
  onAnalyzeSubmission,
  onOpenSubmissionPage,
  onOpenDocumentPreview,
  onOpenAnalysisPage,
  onSubmitActivity,
  onSelectAttachment,
  onClearAttachment,
  onChangeActivityForm,
  onToggleSubmission,
}: TeacherClassManagerModalProps) {
  const imageSubmissions = submissions.filter(isImageSubmission);
  const currentImageIndex =
    analyzingSubmissionId && imageSubmissions.length > 0
      ? imageSubmissions.findIndex((submission) => submission.id === analyzingSubmissionId)
      : -1;

  return (
    <AnimatePresence>
      {open && classroom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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
            className="theme-surface relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl"
          >
            <div className="flex items-center justify-between gap-3 border-b theme-border px-6 py-4">
              <div>
                <p className="text-sm font-medium theme-title">Class Manager</p>
                <h3 className="text-xl font-bold text-[var(--app-text)]">{classroom.name}</h3>
              </div>
              <button
                onClick={onClose}
                className="theme-ring inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex max-h-[calc(90vh-72px)] flex-col gap-6 overflow-y-auto p-6">
              {loading ? (
                <p className="text-sm theme-muted">Loading class data...</p>
              ) : (
                <>
                  <div className="order-1 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Card className="theme-card">
                      <CardContent className="p-3">
                        <p className="text-xs theme-muted">Students Enrolled</p>
                        <p className="text-xl font-bold text-[var(--app-text)]">{students.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="theme-card">
                      <CardContent className="p-3">
                        <p className="text-xs theme-muted">Activities</p>
                        <p className="text-xl font-bold text-[var(--app-text)]">{activities.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="theme-card">
                      <CardContent className="p-3">
                        <p className="text-xs theme-muted">Submissions</p>
                        <p className="text-xl font-bold text-[var(--app-text)]">{submissions.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="theme-card">
                      <CardContent className="p-3">
                        <p className="text-xs theme-muted">Join Code</p>
                        <p className="font-mono font-bold text-[var(--app-text)]">{classroom.code}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="theme-card order-3">
                    <CardContent className="space-y-4 p-5">
                      <h4 className="text-lg font-semibold text-[var(--app-text)]">Create Activity</h4>

                      <form onSubmit={onSubmitActivity} className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            value={activityForm.title}
                            onChange={(event) => onChangeActivityForm({ title: event.target.value })}
                            placeholder="Activity title"
                            required
                            className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                          />
                          <Input
                            value={activityForm.instructor}
                            onChange={(event) =>
                              onChangeActivityForm({ instructor: event.target.value })
                            }
                            placeholder="Instructor"
                            required
                            className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                          />
                        </div>

                        <textarea
                          value={activityForm.description}
                          onChange={(event) =>
                            onChangeActivityForm({ description: event.target.value })
                          }
                          rows={3}
                          placeholder="Activity description"
                          className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 py-2 text-sm text-[var(--app-text)]"
                          required
                        />

                        <div className="grid gap-3 sm:grid-cols-2">
                          <select
                            value={activityForm.submissionType}
                            onChange={(event) =>
                              onChangeActivityForm({
                                submissionType: event.target.value as ActivitySubmissionType,
                              })
                            }
                            className="theme-ring h-10 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 text-sm text-[var(--app-text)]"
                          >
                            <option value="essay">Essays</option>
                            <option value="file">Files</option>
                            <option value="image">Images</option>
                            <option value="code">Code</option>
                          </select>
                          <Input
                            type="datetime-local"
                            value={activityForm.dueDate}
                            onChange={(event) => onChangeActivityForm({ dueDate: event.target.value })}
                            required
                            className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wide theme-muted">
                              Points
                            </label>
                            <Input
                              type="number"
                              min={1}
                              max={10000}
                              step="0.01"
                              value={activityForm.maxScore}
                              onChange={(event) =>
                                onChangeActivityForm({
                                  maxScore: Number(event.target.value) || 0,
                                })
                              }
                              className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
                            />
                          </div>

                          {activityForm.submissionType === "code" && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold uppercase tracking-wide theme-muted">
                                Programming Language
                              </label>
                              <select
                                value={activityForm.programmingLanguage}
                                onChange={(event) =>
                                  onChangeActivityForm({
                                    programmingLanguage: event.target.value,
                                  })
                                }
                                className="theme-ring h-10 w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 text-sm text-[var(--app-text)]"
                              >
                                {PROGRAMMING_LANGUAGES.map((language) => (
                                  <option key={language} value={language}>
                                    {language}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {activityForm.submissionType === "code" && (
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-muted">
                              <Code2 className="h-3.5 w-3.5" />
                              Starter Code
                            </label>
                            <textarea
                              value={activityForm.starterCode}
                              onChange={(event) =>
                                onChangeActivityForm({
                                  starterCode: event.target.value,
                                })
                              }
                              rows={6}
                              spellCheck={false}
                              placeholder="Optional starter code"
                              className="theme-ring w-full overflow-x-auto rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 py-2 font-mono text-sm leading-6 text-[var(--app-text)]"
                            />
                          </div>
                        )}

                        <label className="flex items-center gap-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-3 py-2 text-sm text-[var(--app-text)]">
                          <input
                            type="checkbox"
                            checked={activityForm.allowResubmission}
                            onChange={(event) =>
                              onChangeActivityForm({
                                allowResubmission: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-[var(--app-accent)]"
                          />
                          Allow students to resubmit this activity
                        </label>

                        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium text-[var(--app-text)]">
                                Activity Attachment
                              </p>
                              <p className="text-xs theme-muted">
                                PDF, DOCX, images, or text files up to 5 MB.
                              </p>
                            </div>
                            <Input
                              type="file"
                              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json"
                              onChange={(event) =>
                                onSelectAttachment(event.target.files?.[0])
                              }
                              className="sm:max-w-72"
                            />
                          </div>

                          {isPreparingAttachment && (
                            <div className="mt-3">
                              <div className="mb-1 flex justify-between text-xs theme-muted">
                                <span>Preparing attachment</span>
                                <span>{attachmentProgress}%</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_20%,transparent)]">
                                <div
                                  className="h-full rounded-full bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] transition-all duration-300"
                                  style={{ width: `${attachmentProgress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {activityForm.attachmentName && (
                            <div className="mt-3 flex flex-col gap-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_88%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-[var(--app-accent)]" />
                                <div>
                                  <p className="text-sm font-medium text-[var(--app-text)]">
                                    {activityForm.attachmentName}
                                  </p>
                                  <p className="text-xs theme-muted">
                                    {formatFileSize(activityForm.attachmentSize)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={onClearAttachment}
                              >
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>

                        <Button type="submit" disabled={isCreatingActivity}>
                          <Plus className="mr-2 h-4 w-4" />
                          {isCreatingActivity ? "Creating..." : "Add Activity"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="theme-card order-2">
                    <CardContent className="space-y-3 p-5">
                      <h4 className="text-lg font-semibold text-[var(--app-text)]">Activities</h4>

                      {activities.length === 0 ? (
                        <p className="text-sm theme-muted">No activities created yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {activities.map((activity) => {
                            const focused = focusedActivityId === activity.id;

                            return (
                              <div
                                key={activity.id}
                                className={[
                                  "rounded-xl border p-3 transition",
                                  focused
                                    ? "border-[color-mix(in_srgb,var(--app-accent)_55%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))]"
                                    : "theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]",
                                ].join(" ")}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="font-medium text-[var(--app-text)]">
                                      {activity.title}
                                    </p>
                                    <p className="mt-1 text-xs theme-muted">
                                      {activity.description}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2 text-xs theme-muted">
                                    <CalendarClock className="h-4 w-4 text-[var(--app-accent)]" />
                                    {new Date(activity.dueDate).toLocaleString()}
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs theme-muted">
                                  <span className="rounded-full bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] px-2 py-1 text-[var(--app-accent)]">
                                    {getSubmissionTypeLabel(activity.submissionType)}
                                  </span>
                                  <span>{activity.maxScore} pts</span>
                                  {activity.submissionType === "code" &&
                                    activity.programmingLanguage && (
                                      <span>{activity.programmingLanguage}</span>
                                    )}
                                  <span>{activity.submissionCount} submissions</span>
                                  {focused && (
                                    <span className="font-semibold text-[var(--app-accent)]">
                                      Selected activity
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="theme-card order-4">
                    <CardContent className="space-y-3 p-5">
                      <h4 className="text-lg font-semibold text-[var(--app-text)]">Enrolled Students</h4>

                      {students.length === 0 ? (
                        <p className="text-sm theme-muted">No enrolled students yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {students.map((student) => (
                            <div
                              key={student.id}
                              className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="font-medium text-[var(--app-text)]">{student.name}</p>
                                  <p className="text-xs theme-muted">{student.email}</p>
                                </div>
                                <p className="text-xs theme-muted">{student.submissionCount} submissions</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="theme-card order-3">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="text-lg font-semibold text-[var(--app-text)]">
                          Submissions & AI Analysis
                        </h4>
                        <Button
                          onClick={onAnalyzeAll}
                          disabled={isAnalyzing || submissions.length === 0}
                        >
                          {isAnalyzing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <WandSparkles className="mr-2 h-4 w-4" />
                          )}
                          {isAnalyzing ? "Analyzing..." : "Analyze All"}
                        </Button>
                      </div>

                      {(isAnalyzing || analyzingSubmissionId) && (
                        <div className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))] p-4">
                          <div className="flex items-start gap-3">
                            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[var(--app-accent)]" />
                            <div>
                              <p className="font-semibold text-[var(--app-text)]">
                                Checking content using the detection model...
                              </p>
                              <p className="mt-1 text-sm theme-muted">
                                {currentImageIndex >= 0
                                  ? `Analyzing image ${currentImageIndex + 1} of ${imageSubmissions.length}.`
                                  : imageSubmissions.length > 1
                                    ? `Analyzing ${imageSubmissions.length} image submissions with compact thumbnail results.`
                                    : "Please wait while the selected submission analysis finishes."}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {submissions.length === 0 ? (
                        <p className="text-sm theme-muted">No submissions yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {submissions.map((submission) => {
                            const expanded = expandedSubmissionId === submission.id;

                            return (
                              <div
                                key={submission.id}
                                className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-4 space-y-3"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex min-w-0 gap-3">
                                    {isImageSubmission(submission) && (
                                      <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-bg)_72%,black)]">
                                        {submission.fileDataUrl ? (
                                          <img
                                            src={submission.fileDataUrl}
                                            alt={submission.fileName ?? submission.activityTitle}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="grid h-full w-full place-items-center text-[var(--app-muted)]">
                                            <ImageIcon className="h-6 w-6" />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                    <p className="font-semibold text-[var(--app-text)]">
                                      {submission.studentName}
                                    </p>
                                    <p className="text-xs theme-muted">{submission.studentEmail}</p>
                                    <p className="mt-1 text-sm text-[var(--app-text)]">
                                      {submission.activityTitle}
                                    </p>
                                    <p className="mt-1 text-xs theme-muted">
                                      {getSubmissionTypeLabel(submission.submissionType)} activity
                                    </p>
                                    {submission.fileName && (
                                      <p className="mt-1 truncate text-xs theme-muted">
                                        {submission.fileName}
                                      </p>
                                    )}
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <span
                                      className={[
                                        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                                        getVerdictToneClass(submission),
                                      ].join(" ")}
                                    >
                                      {typeof submission.aiProbability === "number"
                                        ? getDisplayPrediction(submission)
                                        : "Not analyzed"}
                                    </span>
                                    {typeof submission.confidenceScore === "number" && (
                                      <p className="mt-1 text-xs theme-muted">
                                        Confidence: {submission.confidenceScore.toFixed(2)}%
                                      </p>
                                    )}
                                    <p className="mt-1 text-xs theme-muted">{submission.status}</p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onAnalyzeSubmission(submission.id)}
                                    disabled={isAnalyzing || analyzingSubmissionId === submission.id}
                                  >
                                    {analyzingSubmissionId === submission.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <WandSparkles className="mr-2 h-4 w-4" />
                                    )}
                                    {analyzingSubmissionId === submission.id
                                      ? "Analyzing..."
                                      : "Analyze"}
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onOpenSubmissionPage(submission.id)}
                                  >
                                    View Submission Page
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onOpenDocumentPreview(submission.id)}
                                  >
                                    Preview Submission
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onOpenAnalysisPage(submission.id)}
                                  >
                                    View Analysis Report
                                  </Button>

                                  <button
                                    onClick={() => onToggleSubmission(submission.id)}
                                    className="text-sm text-[var(--app-accent)] hover:underline"
                                  >
                                    {expanded ? "Hide" : "View"} detailed analysis
                                  </button>
                                </div>

                                {expanded && (
                                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3 space-y-2 text-sm text-[var(--app-text)]">
                                    {submission.contentText && (
                                      <div>
                                        <p className="font-medium">Submission Content</p>
                                        <p className="whitespace-pre-wrap text-xs theme-muted">
                                          {submission.contentText}
                                        </p>
                                      </div>
                                    )}

                                    {submission.analysisDetails ? (
                                      <>
                                        {typeof submission.analysisDetails.verdict === "string" && (
                                          <p>
                                            <span className="font-medium">Verdict:</span>{" "}
                                            {submission.analysisDetails.verdict}
                                          </p>
                                        )}

                                        {typeof submission.aiProbability === "number" && (
                                          <p>
                                            <span className="font-medium">AI Probability:</span>{" "}
                                            {submission.aiProbability.toFixed(2)}%
                                          </p>
                                        )}

                                        {typeof submission.humanProbability === "number" && (
                                          <p>
                                            <span className="font-medium">Human Probability:</span>{" "}
                                            {submission.humanProbability.toFixed(2)}%
                                          </p>
                                        )}

                                        {typeof submission.confidenceScore === "number" && (
                                          <p>
                                            <span className="font-medium">Confidence Score:</span>{" "}
                                            {submission.confidenceScore.toFixed(2)}%
                                          </p>
                                        )}

                                        {Array.isArray(submission.analysisDetails.reasons) && (
                                          <div>
                                            <p className="font-medium">Reasons</p>
                                            <ul className="list-disc space-y-1 pl-5 text-xs theme-muted">
                                              {submission.analysisDetails.reasons.map(
                                                (reason, index) => (
                                                  <li key={`${submission.id}-reason-${index}`}>
                                                    {String(reason)}
                                                  </li>
                                                ),
                                              )}
                                            </ul>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-xs theme-muted">No analysis details yet.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
