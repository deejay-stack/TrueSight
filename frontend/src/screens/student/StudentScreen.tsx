import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileImage,
  Home,
  Loader2,
  Menu,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { ActivityNotificationsPopover } from "../../components/ActivityNotificationsPopover";
import { AppLogo } from "../../components/AppLogo";
import { DashboardSkeleton } from "../../components/DashboardSkeleton";
import { useAuth } from "../../context/useAuth";
import {
  RECONNECTED_EVENT,
  useNetworkStatus,
} from "../../context/NetworkStatusContext";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import {
  getHasSeenWelcome,
  getWelcomeGreeting,
  markWelcomeSeen,
} from "../../utils/welcome";
import {
  fetchClassActivities,
  fetchEnrolledClasses,
  fetchMyEnrollmentRequests,
  fetchUserNotifications,
  lookupClassByCode,
  markNotificationRead,
  submitEnrollmentRequest,
  type ActivityNotification,
  type ClassJoinLookup,
  type ClassActivity,
  type EnrolledClass,
  type EnrollmentRequest,
  deleteNotification,
} from "./services/studentClassroomService";
import {
  StudentSidebar,
  type StudentSection,
} from "./components/StudentSidebar";
import { StudentEnrolledSection } from "./components/StudentEnrolledSection";
import { StudentSettingsPanel } from "./components/StudentSettingsPanel";
import AboutTrueSightPage from "../shared/AboutTrueSightPage";
import {
  SUPPORT_SIDEBAR_ITEMS,
  SUPPORT_SIDEBAR_LABEL,
} from "../../utils/sidebarNavigation";
import {
  formatFileSize,
  prepareFileUpload,
  type PreparedFileUpload,
} from "../../utils/documentPreview";

const SIDEBAR_ITEMS = [
  { key: "home", label: "Home", icon: Home },
  { key: "enrolled", label: "Enrolled", icon: BookOpen },
] as const;

const DEFAULT_SECTION: StudentSection = "home";
const VALID_SECTIONS: StudentSection[] = [
  "home",
  "enrolled",
  "settings",
  "about",
];

const SECTION_LABELS: Record<StudentSection, string> = {
  home: "Home",
  enrolled: "Enrolled",
  settings: "Settings",
  about: "About",
};

const isValidSection = (value?: string): value is StudentSection =>
  Boolean(value && VALID_SECTIONS.includes(value as StudentSection));

const resolveSection = (value?: string): StudentSection =>
  isValidSection(value) ? value : DEFAULT_SECTION;

const MIN_DASHBOARD_SKELETON_MS = 1000;
const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });

const getEnrollmentStatusCopy = (status: EnrollmentRequest["status"]) => {
  if (status === "accepted") {
    return "Your enrollment request has been approved. You are now enrolled in this class.";
  }

  if (status === "rejected") {
    return "Your enrollment request was rejected. Please review your COR or contact your teacher.";
  }

  return "Your enrollment request is waiting for teacher approval.";
};

const getEnrollmentStatusIcon = (status: EnrollmentRequest["status"]) => {
  if (status === "accepted") return CheckCircle2;
  if (status === "rejected") return AlertCircle;
  return Clock3;
};

const getEnrollmentStatusBadge = (
  status: EnrollmentRequest["status"],
): "success" | "destructive" | "warning" => {
  if (status === "accepted") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
};

export default function StudentScreen() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const { user, logout, darkMode } = useAuth();
  const { online } = useNetworkStatus();
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const welcomeSeenRef = useRef<Record<number, boolean>>({});

  const activeSection = resolveSection(section);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isInitialDashboardLoading, setIsInitialDashboardLoading] = useState(true);

  const [enrolledClasses, setEnrolledClasses] = useState<EnrolledClass[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [activities, setActivities] = useState<ClassActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinLookup, setJoinLookup] = useState<ClassJoinLookup | null>(null);
  const [corUpload, setCorUpload] = useState<PreparedFileUpload | null>(null);
  const [isPreparingCor, setIsPreparingCor] = useState(false);
  const [corUploadProgress, setCorUploadProgress] = useState(0);
  const [enrollmentRequests, setEnrollmentRequests] = useState<
    EnrollmentRequest[]
  >([]);
  const [isLoadingEnrollmentRequests, setIsLoadingEnrollmentRequests] =
    useState(true);

  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const selectedClass = useMemo(
    () => enrolledClasses.find((item) => item.id === selectedClassId) ?? null,
    [enrolledClasses, selectedClassId],
  );

  const upcomingActivities = useMemo(() => {
    return [...activities]
      .sort(
        (left, right) =>
          new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )
      .slice(0, 4);
  }, [activities]);

  const studentName = user?.name || "Student";
  const hasSeenWelcome = user
    ? (welcomeSeenRef.current[user.id] ??= getHasSeenWelcome(user.id))
    : true;
  const welcomeGreeting = getWelcomeGreeting(user?.created_at, hasSeenWelcome);

  const goToSection = (target: StudentSection) => {
    navigate(`/student/student_screen/${target}`);
  };

  const loadEnrolledClasses = async () => {
    setIsLoadingClasses(true);

    try {
      const loaded = await fetchEnrolledClasses();
      setEnrolledClasses(loaded);

      if (loaded.length > 0) {
        setSelectedClassId((current) => current ?? loaded[0].id);
      } else {
        setSelectedClassId(null);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load enrolled classes.";
      toast.error(message);
    } finally {
      setIsLoadingClasses(false);
    }
  };

  const loadEnrollmentRequests = async () => {
    setIsLoadingEnrollmentRequests(true);

    try {
      const loaded = await fetchMyEnrollmentRequests();
      setEnrollmentRequests(loaded);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load enrollment requests.";
      toast.error(message);
      setEnrollmentRequests([]);
    } finally {
      setIsLoadingEnrollmentRequests(false);
    }
  };

  const loadClassActivities = async (classId: string) => {
    setIsLoadingActivities(true);

    try {
      const loaded = await fetchClassActivities(classId);
      setActivities(loaded);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load class activities.";
      toast.error(message);
    } finally {
      setIsLoadingActivities(false);
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

  const handleMarkNotificationRead = async (notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              status: "read",
              readAt: notification.readAt ?? new Date().toISOString(),
            }
          : notification,
      ),
    );

    try {
      await markNotificationRead(notificationId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update notification.";
      toast.error(message);
      await loadNotifications();
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    const previous = notifications;
    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );

    try {
      await deleteNotification(notificationId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete notification.";
      toast.error(message);
      setNotifications(previous);
    }
  };

  const handleOpenNotification = async (notification: ActivityNotification) => {
    if (!notification.activityId) {
      toast.error("This notification is not linked to an activity.");
      return;
    }

    if (notification.status === "unread") {
      void handleMarkNotificationRead(notification.id);
    }

    setNotificationsOpen(false);
    navigate(
      `/student/classes/${notification.classId}/activities/${notification.activityId}`,
    );
  };

  useEffect(() => {
    let active = true;

    const loadInitialDashboard = async () => {
      try {
        await Promise.all([
          loadEnrolledClasses(),
          loadEnrollmentRequests(),
          loadNotifications(),
          wait(MIN_DASHBOARD_SKELETON_MS),
        ]);
      } finally {
        if (active) {
          setIsInitialDashboardLoading(false);
        }
      }
    };

    void loadInitialDashboard();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleReconnect = () => {
      void Promise.all([
        loadEnrolledClasses(),
        loadEnrollmentRequests(),
        loadNotifications(),
      ]);
    };

    window.addEventListener(RECONNECTED_EVENT, handleReconnect);
    return () => window.removeEventListener(RECONNECTED_EVENT, handleReconnect);
  }, []);

  useEffect(() => {
    if (user?.id) {
      const timer = window.setTimeout(() => markWelcomeSeen(user.id), 2000);
      return () => window.clearTimeout(timer);
    }
  }, [user?.id]);

  useEffect(() => {
    if (section !== activeSection) {
      navigate(`/student/student_screen/${activeSection}`, { replace: true });
    }
  }, [activeSection, navigate, section]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setActivities([]);
      return;
    }

    void loadClassActivities(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeSection, selectedClassId]);

  const handleValidateClassCode = async () => {
    if (!online) {
      toast.error("Internet access is required to validate a class code.");
      return;
    }

    if (!joinCode.trim()) {
      toast.error("Please enter a class code.");
      return;
    }

    setIsJoining(true);

    try {
      const lookup = await lookupClassByCode(joinCode.trim());
      setJoinLookup(lookup);

      if (lookup.enrollment) {
        toast.success(`You are already enrolled in ${lookup.classroom.name}.`);
        setSelectedClassId(lookup.classroom.id);
        goToSection("enrolled");
        return;
      }

      if (lookup.request?.status === "pending") {
        toast("You already have a pending request for this class.");
        return;
      }

      toast.success("Class code verified. Upload your COR to request enrollment.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to validate class code.";
      toast.error(message);
      setJoinLookup(null);
    } finally {
      setIsJoining(false);
    }
  };

  const handleSelectCor = async (file: File | undefined) => {
    if (!file) return;

    setIsPreparingCor(true);
    setCorUploadProgress(0);

    try {
      const upload = await prepareFileUpload(
        file,
        setCorUploadProgress,
        "cor-upload",
      );
      setCorUpload(upload);
      toast.success("COR image ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to prepare COR image.";
      toast.error(message);
      setCorUpload(null);
      setCorUploadProgress(0);
    } finally {
      setIsPreparingCor(false);
    }
  };

  const handleSubmitEnrollmentRequest = async () => {
    if (!online) {
      toast.error("Internet access is required to submit an enrollment request.");
      return;
    }

    if (!joinLookup) {
      toast.error("Validate a class code first.");
      return;
    }

    if (!corUpload) {
      toast.error("Please upload your COR image.");
      return;
    }

    setIsJoining(true);

    try {
      await submitEnrollmentRequest({
        code: joinLookup.classroom.code,
        corFileName: corUpload.fileName,
        corFileType: corUpload.fileType,
        corFileSize: corUpload.fileSize,
        corDataUrl: corUpload.fileDataUrl,
      });
      toast.success("Enrollment request submitted.");
      setJoinCode("");
      setJoinLookup(null);
      setCorUpload(null);
      setCorUploadProgress(0);
      await Promise.all([loadEnrollmentRequests(), loadNotifications()]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to submit enrollment request.";
      toast.error(message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to logout.";
      toast.error(message);
      return;
    }

    window.location.href = "/auth/login_screen";
  };

  const renderHome = () => (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="theme-surface rounded-3xl border border-dashed theme-border px-6 py-7 sm:px-8"
      >
        <h1 className="theme-title text-3xl font-extrabold sm:text-4xl">TrueSight</h1>
        <p className="mt-4 max-w-3xl text-base theme-muted sm:text-lg">
          An AI-powered tool desgined for academic integrity in Buenavista Community College. Join your classes, view activities, and submit your work with confidence.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => goToSection("enrolled")}>
            <BookOpen className="mr-2 h-4 w-4" />
            Open Enrolled
          </Button>
          <Button variant="outline" onClick={() => joinInputRef.current?.focus()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Join New Class
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card transition-all">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Enrolled</p>
              <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                {enrolledClasses.length}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card transition-all">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Upcoming</p>
              <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                {upcomingActivities.length}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card transition-all">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Active Class</p>
              <p className="mt-2 text-base font-semibold text-[var(--app-text)]">
                {selectedClass?.name ?? "No class selected"}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card className="theme-card">
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">
              Request Class Enrollment
            </p>
            <p className="text-xs theme-muted">
              Enter a valid class code, upload your COR, then wait for teacher approval.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={joinInputRef}
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value.toUpperCase());
                setJoinLookup(null);
                setCorUpload(null);
                setCorUploadProgress(0);
              }}
              placeholder="e.g. ABC123-XY4"
              className="bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]"
            />
            <Button onClick={handleValidateClassCode} disabled={isJoining || !online} title={!online ? "Internet access is required." : undefined}>
              {isJoining ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Verify Code
            </Button>
          </div>

          {joinLookup && !joinLookup.enrollment && (
            <div className="space-y-4 rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide theme-muted">Class</p>
                  <p className="font-semibold text-[var(--app-text)]">
                    {joinLookup.classroom.name}
                  </p>
                  <p className="text-xs theme-muted">
                    Code: {joinLookup.classroom.code}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide theme-muted">Student</p>
                  <p className="font-semibold text-[var(--app-text)]">{studentName}</p>
                  <p className="text-xs theme-muted">
                    Teacher: {joinLookup.classroom.teacherName}
                  </p>
                </div>
              </div>

              {joinLookup.request && (
                <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3 text-sm theme-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getEnrollmentStatusBadge(joinLookup.request.status)}>
                      {joinLookup.request.status}
                    </Badge>
                    <span>{getEnrollmentStatusCopy(joinLookup.request.status)}</span>
                  </div>
                  {joinLookup.request.rejectionNote && (
                    <p className="mt-2 text-xs">
                      Note: {joinLookup.request.rejectionNote}
                    </p>
                  )}
                </div>
              )}

              {joinLookup.request?.status !== "pending" && (
                <>
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] px-4 py-6 text-center transition hover:border-[var(--app-accent)]">
                    <FileImage className="h-8 w-8 text-[var(--app-accent)]" />
                    <span className="mt-2 text-sm font-semibold text-[var(--app-text)]">
                      Upload Certificate of Registration
                    </span>
                    <span className="mt-1 text-xs theme-muted">
                      PNG, JPG, JPEG, or WEBP up to 5 MB
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) =>
                        void handleSelectCor(event.currentTarget.files?.[0])
                      }
                    />
                  </label>

                  {isPreparingCor && (
                    <p className="text-xs theme-muted">
                      Preparing COR image... {corUploadProgress}%
                    </p>
                  )}

                  {corUpload && (
                    <div className="flex flex-col gap-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3 sm:flex-row sm:items-center">
                      <img
                        src={corUpload.fileDataUrl}
                        alt="COR preview"
                        className="h-28 w-full rounded-lg object-cover sm:w-40"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="truncate font-semibold text-[var(--app-text)]">
                          {corUpload.fileName}
                        </p>
                        <p className="text-xs theme-muted">
                          {formatFileSize(corUpload.fileSize)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCorUpload(null);
                          setCorUploadProgress(0);
                        }}
                        className="theme-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border theme-border text-[var(--app-muted)] hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <Button
                    onClick={handleSubmitEnrollmentRequest}
                    disabled={isJoining || isPreparingCor || !corUpload || !online}
                    title={!online ? "Internet access is required." : undefined}
                  >
                    {isJoining ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileImage className="mr-2 h-4 w-4" />
                    )}
                    Submit Enrollment Request
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="theme-card">
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">
              Enrollment Requests
            </p>
            <p className="text-xs theme-muted">
              Pending requests do not unlock class activities until accepted.
            </p>
          </div>

          {isLoadingEnrollmentRequests ? (
            <p className="text-sm theme-muted">Loading enrollment requests...</p>
          ) : enrollmentRequests.length === 0 ? (
            <p className="text-sm theme-muted">No enrollment requests yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {enrollmentRequests.map((request) => {
                const Icon = getEnrollmentStatusIcon(request.status);

                return (
                  <div
                    key={request.id}
                    className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--app-text)]">
                          {request.className}
                        </p>
                        <p className="text-xs theme-muted">
                          {request.classCode} - {request.teacherName ?? "Teacher"}
                        </p>
                      </div>
                      <Badge variant={getEnrollmentStatusBadge(request.status)}>
                        <Icon className="mr-1 h-3.5 w-3.5" />
                        {request.status}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm theme-muted">
                      {getEnrollmentStatusCopy(request.status)}
                    </p>
                    {request.rejectionNote && (
                      <p className="mt-2 text-xs theme-muted">
                        Note: {request.rejectionNote}
                      </p>
                    )}
                    <p className="mt-3 text-xs theme-muted">
                      Submitted {new Date(request.submittedAt).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderEnrolled = () => (
    <StudentEnrolledSection
      enrolledClasses={enrolledClasses}
      selectedClassId={selectedClassId}
      selectedClass={selectedClass}
      activities={activities}
      isLoadingClasses={isLoadingClasses}
      isLoadingActivities={isLoadingActivities}
      onSelectClass={(classId) => {
        setSelectedClassId(classId);
        goToSection("enrolled");
      }}
      onOpenActivityDetails={(activity) =>
        navigate(`/student/classes/${activity.classId}/activities/${activity.id}`)
      }
    />
  );

  const renderSettings = () => (
    <StudentSettingsPanel onAccountDeleted={() => (window.location.href = "/auth/login_screen")} />
  );

  if (isInitialDashboardLoading) {
    return <DashboardSkeleton role="student" darkMode={darkMode} />;
  }

  return (
    <div
      className="role-theme-page h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle("student", darkMode)}
    >
      <StudentSidebar
        items={[...SIDEBAR_ITEMS]}
        footerItems={[...SUPPORT_SIDEBAR_ITEMS]}
        footerLabel={SUPPORT_SIDEBAR_LABEL}
        activeSection={activeSection}
        mobileOpen={mobileSidebarOpen}
        enrolledClasses={enrolledClasses}
        selectedClassId={selectedClassId}
        onSelectSection={goToSection}
        onSelectClass={(classId) => {
          setSelectedClassId(classId);
          goToSection("enrolled");
        }}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <header className="fixed left-0 right-0 top-0 z-10 h-20 border-b theme-border bg-[color-mix(in_srgb,var(--app-bg)_78%,transparent)] backdrop-blur-md md:left-20">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="theme-ring inline-flex h-10 w-10 items-center justify-center rounded-xl border theme-border text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <AppLogo variant="icon" iconClassName="hidden h-10 w-10 rounded-xl sm:grid" />
            <div className="min-w-0">
              <p className="text-xs theme-muted">
                Student Panel - {SECTION_LABELS[activeSection]}
              </p>
              <p className="truncate text-base font-semibold text-[var(--app-text)] sm:text-lg">
                {welcomeGreeting}, {studentName}
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
              onMarkRead={(notificationId) =>
                void handleMarkNotificationRead(notificationId)
              }
              onDelete={(notificationId) =>
                void handleDeleteNotification(notificationId)
              }
              onNotificationClick={(notification) =>
                void handleOpenNotification(notification)
              }
            />
          </div>
        </div>
      </header>

      <main
        ref={mainScrollRef}
        data-route-scroll-container
        className="fixed inset-x-0 bottom-0 top-20 overflow-y-auto px-4 py-6 pb-10 sm:px-6 md:left-20"
      >
        <div className="mx-auto max-w-6xl">
          {activeSection === "home" && renderHome()}
          {activeSection === "enrolled" && renderEnrolled()}
          {activeSection === "settings" && renderSettings()}
          {activeSection === "about" && <AboutTrueSightPage />}
        </div>
      </main>

    </div>
  );
}
