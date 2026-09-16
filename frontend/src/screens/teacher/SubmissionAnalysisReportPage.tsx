import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Home,
  Loader2,
  Menu,
  Upload,
  WandSparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { ActivityNotificationsPopover } from "../../components/ActivityNotificationsPopover";
import { useAuth } from "../../context/useAuth";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import {
  analyzeSingleSubmission,
  fetchDocumentPreview,
  fetchSubmissionDetail,
  fetchUserNotifications,
  type ActivityNotification,
  type ClassSubmission,
  type PreviewDocument,
} from "./services/teacherClassroomService";
import { AIExplainabilityPanel } from "./components/AIExplainabilityPanel";
import { MultiLevelAIDetectionPanel } from "./components/MultiLevelAIDetectionPanel";
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
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const isImageSubmission = (submission: ClassSubmission | null): boolean => {
  if (!submission) return false;
  return (
    submission.submissionType === "image" ||
    submission.fileType?.toLowerCase().startsWith("image/") === true
  );
};

export default function SubmissionAnalysisReportPage() {
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

  const loadSubmission = async () => {
    if (!submissionId) return;

    setLoading(true);
    try {
      const response = await fetchSubmissionDetail(submissionId);
      setSubmission(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load report.";
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
      // Ignore logout transport errors and keep flow deterministic.
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
      if (result.analysisDetails?.analysisStatus === "failed") toast.error("AI detection temporarily unavailable.");
      else toast.success("Analysis updated.");
      await loadSubmission();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run analysis.";
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const details = useMemo(() => submission?.analysisDetails ?? null, [submission]);
  const metrics = isRecord(details?.metrics) ? details.metrics : null;

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
                Analysis Report
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
              onClick={() => navigate(`/teacher/submissions/${submissionId}`)}
            >
              Open Submission Page
            </Button>
          )}
          <Button onClick={() => void handleAnalyze()} disabled={isAnalyzing || !submissionId}>
            {isAnalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="mr-2 h-4 w-4" />
            )}
            {isAnalyzing ? "Analyzing..." : "Run/Re-run Analysis"}
          </Button>
        </div>

        {isAnalyzing && (
          <Card className="theme-card">
            <CardContent className="flex items-start gap-3 p-5">
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[var(--app-accent)]" />
              <div>
                <p className="font-semibold text-[var(--app-text)]">
                  Checking content using the detection model...
                </p>
                <p className="mt-1 text-sm theme-muted">
                  The analysis report will refresh when processing is complete.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card className="theme-card">
            <CardContent className="p-6 text-sm theme-muted">Loading analysis report...</CardContent>
          </Card>
        ) : !submission ? (
          <Card className="theme-card">
            <CardContent className="p-6 text-sm theme-muted">
              Report not found or access denied.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="theme-card">
              <CardContent className="space-y-3 p-5">
                <h2 className="text-2xl font-bold text-[var(--app-text)]">
                  {submission.activityTitle}
                </h2>
                <p className="text-sm theme-muted">
                  Student: {submission.studentName} ({submission.studentEmail})
                </p>
                <p className="text-sm theme-muted">
                  Class: {submission.className ?? "Class"} | Status: {submission.status}
                </p>
              </CardContent>
            </Card>

            <MultiLevelAIDetectionPanel
              submission={submission}
              details={details}
              imagePreviewUrl={imagePreview?.dataUrl ?? submission.fileDataUrl ?? null}
              imagePreviewName={imagePreview?.fileName ?? submission.fileName}
              imagePreviewLoading={isImagePreviewLoading}
            />

            <AIExplainabilityPanel details={details} />

            <Card className="theme-card">
              <CardContent className="space-y-3 p-5">
                <h3 className="text-lg font-semibold text-[var(--app-text)]">Metrics</h3>
                {!metrics ? (
                  <p className="text-sm theme-muted">
                    Metrics are unavailable for this submission.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(metrics).map(([key, value]) => {
                      const numericValue = asNumber(value);
                      const renderedValue =
                        numericValue !== null ? numericValue.toFixed(3) : String(value);

                      return (
                        <div
                          key={key}
                          className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3"
                        >
                          <p className="text-xs uppercase tracking-wide theme-muted">{key}</p>
                          <p className="text-base font-semibold text-[var(--app-text)]">
                            {renderedValue}
                          </p>
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
      </main>
    </div>
  );
}
