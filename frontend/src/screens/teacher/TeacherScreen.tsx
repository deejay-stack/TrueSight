import { AcademicSelectors, type AcademicSelection } from "../../components/AcademicSelectors";
import { AcademicReviewPanel } from "./components/AcademicReviewPanel";
import { TeacherSubjectsPage } from "./TeacherSubjectsPage";
import { fetchAcademicEnrollmentIntents,reviewAcademicCor,type AcademicEnrollmentIntent } from '../../services/academicEnrollmentService';
import { notificationTarget } from '../../utils/notificationTarget';
import { CurriculumSubjectSelect } from "../../components/CurriculumSubjectSelect";
import type { RubricCriterion } from "../../services/lmsService";
import type {CodeSettings} from '../../services/codeWorkspaceService';
import { useEffect, useState, type FormEvent } from "react";
import { useRef } from "react";
import { useLocation,useNavigate, useParams,useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Library,
  CalendarClock,
  ClipboardList,
  FileText,
  Home,
  Menu,
  Upload,
  Users,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { GlobalThemeToggle } from "../../components/theme/GlobalThemeToggle";
import { AppLogo } from "../../components/AppLogo";
import { DashboardSkeleton } from "../../components/DashboardSkeleton";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import { useAuth } from "../../context/useAuth";
import {
  RECONNECTED_EVENT,
  useNetworkStatus,
} from "../../context/NetworkStatusContext";
import { getRoleThemeStyle } from "../../theme/roleThemes";
import { ActivityNotificationsPopover } from "../../components/ActivityNotificationsPopover";
import {
  analyzeSingleSubmission,
  analyzeAllClassSubmissions,
  createClassActivity,
  createTeacherClass,
  deleteNotification,
  fetchClassActivities,
  fetchClassStudents,
  fetchClassSubmissions,
  fetchTeacherEnrollmentRequests,
  fetchTeacherAnalytics,
  fetchTeacherOverview,
  fetchUserNotifications,
  markNotificationRead,
  reviewEnrollmentRequest,
  type ActivityNotification,
  type ActivitySubmissionType,
  type ClassActivity,
  type ClassSubmission,
  type EnrolledStudent,
  type EnrollmentRequest,
  type TeacherAnalytics,
  type TeacherClass,
  type TeacherOverviewActivity,
  type TeacherOverviewStudent,
} from "./services/teacherClassroomService";
import { SemesterSelect } from "../../components/SemesterSelect";
import {
  TeacherSidebar,
  type TeacherSection,
} from "./components/TeacherSidebar";
import { TeacherClassManagerModal } from "./components/TeacherClassManagerModal";
import { TeacherSettingsPanel } from "./components/TeacherSettingsPanel";
import { TeacherHomeSection } from "./components/TeacherHomeSection";
import { TeacherClassesSection } from "./components/TeacherClassesSection";
import { TeacherStudentsSection } from "./components/TeacherStudentsSection";
import { TeacherSubmissionsSection } from "./components/TeacherSubmissionsSection";
import { TeacherActivitiesSection } from "./components/TeacherActivitiesSection";
import { TeacherUpcomingSection } from "./components/TeacherUpcomingSection";
import { TeacherUploadsSection } from "./components/TeacherUploadsSection";
import AboutTrueSightPage from "../shared/AboutTrueSightPage";
import { getDisplayInitials } from "../../utils/profileImage";
import { prepareFileUpload } from "../../utils/documentPreview";
import {
  SUPPORT_SIDEBAR_ITEMS,
  SUPPORT_SIDEBAR_LABEL,
} from "../../utils/sidebarNavigation";
import {
  getHasSeenWelcome,
  getWelcomeGreeting,
  markWelcomeSeen,
} from "../../utils/welcome";

type Section = TeacherSection;

type ActivityFormState = {
  codeSettings?:CodeSettings;
  aiScoringEnabled?: boolean;
  rubric?: RubricCriterion[];
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

const SIDEBAR_ITEMS = [
  { key: "home", label: "Home", icon: Home },
  { key: "classes", label: "Classes", icon: BookOpen },
  { key: "subjects", label: "Subjects", icon: Library },
  { key: "students", label: "Students", icon: Users },
  { key: "uploads", label: "Enrollment Requests", icon: Upload },
  { key: "activities", label: "Activities", icon: ClipboardList },
  { key: "submissions", label: "Submissions", icon: FileText },
  { key: "upcoming", label: "Upcoming", icon: CalendarClock },
] as const;

const DEFAULT_SECTION: Section = "home";
const LEGACY_SECTION_REDIRECTS: Record<string, Section> = {
  calendar: "upcoming",
};
const VALID_SECTIONS: Section[] = [
  "home",
  "classes",
  "subjects",
  "students",
  "uploads",
  "activities",
  "submissions",
  "upcoming",
  "settings",
  "about",
];

const SECTION_LABELS: Record<Section, string> = {
  home: "Home",
  classes: "Classes",
  subjects: "Subjects",
  students: "Students",
  uploads: "Enrollment Requests",
  activities: "Activities",
  submissions: "Submissions",
  upcoming: "Upcoming",
  settings: "Settings",
  about: "About",
};

const MIN_DASHBOARD_SKELETON_MS = 1000;
const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });

const isValidSection = (value?: string): value is Section =>
  Boolean(value && VALID_SECTIONS.includes(value as Section));

const resolveSection = (value?: string): Section => {
  if (!value) {
    return DEFAULT_SECTION;
  }

  if (LEGACY_SECTION_REDIRECTS[value]) {
    return LEGACY_SECTION_REDIRECTS[value];
  }

  return isValidSection(value) ? value : DEFAULT_SECTION;
};

export default function TeacherScreen() {
  const navigate = useNavigate();
  const location=useLocation();
  const [searchParams]=useSearchParams();
  const { section, activityId } = useParams<{
    section?: string;
    activityId?: string;
  }>();
  const { user, logout, darkMode } = useAuth();
  const { online } = useNetworkStatus();
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const welcomeSeenRef = useRef<Record<number, boolean>>({});
  const handledActivityRouteRef = useRef<string | null>(null);

  const activeSection = activityId ? "activities" : resolveSection(section);

  const teacherName = user?.name ?? "Teacher";
  const hasSeenWelcome = user
    ? (welcomeSeenRef.current[user.id] ??= getHasSeenWelcome(user.id))
    : true;
  const welcomeGreeting = getWelcomeGreeting(user?.created_at, hasSeenWelcome);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isInitialDashboardLoading, setIsInitialDashboardLoading] = useState(true);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [overviewStudents, setOverviewStudents] = useState<
    TeacherOverviewStudent[]
  >([]);
  const [overviewActivities, setOverviewActivities] = useState<
    TeacherOverviewActivity[]
  >([]);
  const [upcomingActivities, setUpcomingActivities] = useState<
    TeacherOverviewActivity[]
  >([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [analytics, setAnalytics] = useState<TeacherAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [notifications, setNotifications] = useState<ActivityNotification[]>(
    [],
  );
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [enrollmentRequests, setEnrollmentRequests] = useState<
    EnrollmentRequest[]
  >([]);
  const [academicIntents,setAcademicIntents] = useState<AcademicEnrollmentIntent[]>([]);
  const [reviewingAcademicId,setReviewingAcademicId]=useState<number|null>(null);
  const enrollmentLoadGeneration = useRef(0);
  const [isLoadingEnrollmentRequests, setIsLoadingEnrollmentRequests] =
    useState(true);
  const [reviewingEnrollmentRequestId, setReviewingEnrollmentRequestId] =
    useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [classAcademics, setClassAcademics] = useState<AcademicSelection>({ departmentCode: "", yearLevel: 0 });
  const [classSubjectId, setClassSubjectId] = useState('');
  const [classSemester, setClassSemester] = useState(1);
  const [description, setDescription] = useState("");
  const [latestCreatedCode, setLatestCreatedCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [isClassManagerOpen, setIsClassManagerOpen] = useState(false);
  const [managedClass, setManagedClass] = useState<TeacherClass | null>(null);
  const [isLoadingClassManager, setIsLoadingClassManager] = useState(false);

  const [classActivities, setClassActivities] = useState<ClassActivity[]>([]);
  const [classStudents, setClassStudents] = useState<EnrolledStudent[]>([]);
  const [classSubmissions, setClassSubmissions] = useState<ClassSubmission[]>(
    [],
  );

  const [activityForm, setActivityForm] = useState<ActivityFormState>({
    title: "",
    instructor: teacherName,
    description: "",
    submissionType: "essay",
    allowResubmission: true,
    maxScore: 100,
    programmingLanguage: "JavaScript",
    starterCode: "",
    attachmentName: "",
    attachmentType: "",
    attachmentSize: 0,
    attachmentDataUrl: "",
    dueDate: "",
  });
  const [isPreparingActivityAttachment, setIsPreparingActivityAttachment] =
    useState(false);
  const [activityAttachmentProgress, setActivityAttachmentProgress] = useState(0);
  const [isCreatingActivity, setIsCreatingActivity] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingSubmissionId, setAnalyzingSubmissionId] = useState<
    string | null
  >(null);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<
    string | null
  >(null);

  const goToSection = (target: Section) => {
    navigate(`/teacher/teacher_screen/${target}`);
  };

  useEffect(() => {
    if (activityId) {
      return;
    }

    if (section !== activeSection) {
      navigate(`/teacher/teacher_screen/${activeSection}`, { replace: true });
    }
  }, [activeSection, activityId, navigate, section]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeSection]);

  useEffect(() => {
    setActivityForm((previous) => ({ ...previous, instructor: teacherName }));
  }, [teacherName]);

  const loadTeacherOverview = async () => {
    setIsLoadingOverview(true);

    try {
      const overview = await fetchTeacherOverview();
      setClasses(overview.classes);
      setManagedClass(current => current ? overview.classes.find(c => c.id === current.id) ?? current : null);
      setOverviewStudents(overview.students);
      setOverviewActivities(overview.activities);
      setUpcomingActivities(overview.upcoming);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load dashboard data.";
      toast.error(message);
      setClasses([]);
      setOverviewStudents([]);
      setOverviewActivities([]);
      setUpcomingActivities([]);
    } finally {
      setIsLoadingOverview(false);
    }
  };

  const loadTeacherAnalytics = async () => {
    setIsLoadingAnalytics(true);

    try {
      const payload = await fetchTeacherAnalytics();
      setAnalytics(payload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load analytics data.";
      toast.error(message);
      setAnalytics(null);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const loadNotifications = async () => {
    setIsLoadingNotifications(true);

    try {
      const payload = await fetchUserNotifications();
      setNotifications(payload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load notifications.";
      toast.error(message);
      setNotifications([]);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const loadEnrollmentRequests = async () => {
    const generation=++enrollmentLoadGeneration.current;
    setIsLoadingEnrollmentRequests(true);

    try {
      const [requests,intents] = await Promise.allSettled([fetchTeacherEnrollmentRequests(),fetchAcademicEnrollmentIntents()]);
      if(generation!==enrollmentLoadGeneration.current)return;
      if(requests.status==='fulfilled')setEnrollmentRequests(requests.value);
      else toast.error(requests.reason instanceof Error?requests.reason.message:'Unable to load class approval requests.');
      if(intents.status==='fulfilled')setAcademicIntents(intents.value);
      else toast.error(intents.reason instanceof Error?intents.reason.message:'Unable to load academic verification submissions.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load enrollment requests.";
      toast.error(message);
    } finally {
      if(generation===enrollmentLoadGeneration.current)setIsLoadingEnrollmentRequests(false);
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

  const handleOpenNotification = (notification: ActivityNotification) => {
    setNotificationsOpen(false);
    if(notification.status==='unread')void handleMarkNotificationRead(notification.id);
    const target=notificationTarget('teacher',notification);
    if(target)navigate(target);
    if(notification.type==='enrollment_request')void loadEnrollmentRequests();
  };

  const handleReviewAcademicCor=async(intent:AcademicEnrollmentIntent,status:'accepted'|'rejected',note:string)=>{
    if(reviewingAcademicId!==null)return;
    if(!online){toast.error('Internet access is required to review enrollment.');return;}
    setReviewingAcademicId(intent.id);
    try {
      const result=await reviewAcademicCor(intent.id,status,note);
      toast.success(result.message);
      if(result.enrollmentRequestId)navigate(`/teacher/teacher_screen/uploads?request=${result.enrollmentRequestId}`);
      await Promise.all([loadEnrollmentRequests(),loadTeacherOverview(),loadNotifications()]);
    }catch(e){toast.error(e instanceof Error?e.message:'Unable to review submission.');await loadEnrollmentRequests();}
    finally{setReviewingAcademicId(null);}
  };

  const loadClassManagerData = async (classId: string) => {
    setIsLoadingClassManager(true);

    try {
      const [activities, students, submissions] = await Promise.all([
        fetchClassActivities(classId),
        fetchClassStudents(classId),
        fetchClassSubmissions(classId),
      ]);

      setClassActivities(activities);
      setClassStudents(students);
      setClassSubmissions(submissions);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load class manager.";
      toast.error(message);
    } finally {
      setIsLoadingClassManager(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadInitialDashboard = async () => {
      try {
        await Promise.all([
          loadTeacherOverview(),
          loadTeacherAnalytics(),
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
        loadTeacherOverview(),
        loadTeacherAnalytics(),
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
    const timer = window.setInterval(() => {
      void Promise.all([loadNotifications(), loadEnrollmentRequests()]);
    }, 15_000);
    const focus=()=>{void Promise.all([loadNotifications(),loadEnrollmentRequests()]);};
    window.addEventListener('focus',focus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus',focus);
    };
  }, []);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success("Class code copied.");
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast.error("Unable to copy class code.");
    }
  };

  const resetCreateClassForm = () => {
    setClassAcademics({ departmentCode: "", yearLevel: 0 });
    setClassSubjectId('');
    setClassSemester(1);
    setDescription("");
  };

  const handleCreateClass = async (event: FormEvent) => {
    event.preventDefault();

    if (!online) {
      toast.error("Internet access is required to create a class.");
      return;
    }

    if (isCreatingClass) {
      return;
    }

    if (!classAcademics.departmentCode || !classAcademics.yearLevel) { toast.error("Select the class department and year level."); return; }
    if (!classSubjectId) { toast.error("Select an official curriculum subject for this department, year and semester."); return; }
    setIsCreatingClass(true);

    try {
      const createdClass = await createTeacherClass({
        subjectId: Number(classSubjectId),
        semester: classSemester,
        description: description.trim(),
        ...classAcademics,
      });

      setLatestCreatedCode(createdClass.code);
      setIsCreateModalOpen(false);
      resetCreateClassForm();
      await Promise.all([loadTeacherOverview(), loadTeacherAnalytics()]);
      goToSection("classes");
      toast.success("Class created successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create class.";
      toast.error(message);
    } finally {
      setIsCreatingClass(false);
    }
  };

  const openClassManager = async (classroom: TeacherClass) => {
    setManagedClass(classroom);
    setIsClassManagerOpen(true);
    setExpandedSubmissionId(null);
    setActivityForm({
      title: "",
      instructor: teacherName,
      description: "",
      submissionType: "essay",
      allowResubmission: true,
      maxScore: 100,
      programmingLanguage: "JavaScript",
      starterCode: "",
      attachmentName: "",
      attachmentType: "",
      attachmentSize: 0,
      attachmentDataUrl: "",
      dueDate: "",
    });
    setActivityAttachmentProgress(0);

    await loadClassManagerData(classroom.id);
  };

  const closeClassManager = () => {
    setIsClassManagerOpen(false);

    if (activityId) {
      navigate("/teacher/teacher_screen/activities", { replace: true });
    }
  };

  useEffect(() => {
    if (!activityId || isLoadingOverview) {
      return;
    }

    if (handledActivityRouteRef.current === activityId) {
      return;
    }

    const activity = overviewActivities.find((item) => item.id === activityId);

    if (!activity) {
      handledActivityRouteRef.current = activityId;
      toast.error("Activity could not be loaded or no longer exists.");
      navigate("/teacher/teacher_screen/activities", { replace: true });
      return;
    }

    const classroom = classes.find((item) => item.id === activity.classId);

    if (!classroom) {
      handledActivityRouteRef.current = activityId;
      toast.error("Activity class could not be loaded.");
      navigate("/teacher/teacher_screen/activities", { replace: true });
      return;
    }

    handledActivityRouteRef.current = activityId;
    void openClassManager(classroom);
  }, [
    activityId,
    classes,
    isLoadingOverview,
    navigate,
    openClassManager,
    overviewActivities,
  ]);

  const handleSelectActivityAttachment = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsPreparingActivityAttachment(true);
    setActivityAttachmentProgress(0);

    try {
      const upload = await prepareFileUpload(file, setActivityAttachmentProgress);
      setActivityForm((previous) => ({
        ...previous,
        attachmentName: upload.fileName,
        attachmentType: upload.fileType,
        attachmentSize: upload.fileSize,
        attachmentDataUrl: upload.fileDataUrl,
      }));
      toast.success("Attachment ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to prepare attachment.";
      toast.error(message);
      setActivityAttachmentProgress(0);
    } finally {
      setIsPreparingActivityAttachment(false);
    }
  };

  const clearActivityAttachment = () => {
    setActivityForm((previous) => ({
      ...previous,
      attachmentName: "",
      attachmentType: "",
      attachmentSize: 0,
      attachmentDataUrl: "",
    }));
    setActivityAttachmentProgress(0);
  };

  const handleCreateActivity = async (event: FormEvent) => {
    event.preventDefault();

    if (!online) {
      toast.error("Internet access is required to create an activity.");
      return;
    }

    if (!managedClass || isCreatingActivity) {
      return;
    }

    setIsCreatingActivity(true);

    try {
      await createClassActivity(managedClass.id, {
        title: activityForm.title.trim(),
        instructor: activityForm.instructor.trim(),
        description: activityForm.description.trim(),
        submissionType: activityForm.submissionType,
        allowResubmission: activityForm.allowResubmission,
        maxScore: activityForm.maxScore,
        rubric: activityForm.rubric ?? [],
        aiScoringEnabled: activityForm.aiScoringEnabled === true,
        codeSettings:activityForm.submissionType==='code'?activityForm.codeSettings:undefined,
        programmingLanguage:
          activityForm.submissionType === "code"
            ? activityForm.programmingLanguage
            : undefined,
        starterCode:
          activityForm.submissionType === "code"
            ? activityForm.starterCode
            : undefined,
        attachmentName: activityForm.attachmentName || undefined,
        attachmentType: activityForm.attachmentType || undefined,
        attachmentSize: activityForm.attachmentSize || undefined,
        attachmentDataUrl: activityForm.attachmentDataUrl || undefined,
        dueDate: activityForm.dueDate,
      });

      toast.success("Activity created successfully.");
      setActivityForm({
        title: "",
        instructor: teacherName,
        description: "",
        submissionType: "essay",
        allowResubmission: true,
        maxScore: 100,
        programmingLanguage: "JavaScript",
        starterCode: "",
        attachmentName: "",
        attachmentType: "",
        attachmentSize: 0,
        attachmentDataUrl: "",
        dueDate: "",
      });
      setActivityAttachmentProgress(0);

      await Promise.all([
        loadTeacherOverview(),
        loadTeacherAnalytics(),
        loadNotifications(),
        loadClassManagerData(managedClass.id),
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create activity.";
      toast.error(message);
    } finally {
      setIsCreatingActivity(false);
    }
  };

  const handleAnalyzeAll = async () => {
    if (!online) {
      toast.error("Internet access is required to analyze submissions.");
      return;
    }

    if (!managedClass || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);

    try {
      const { updated, failed } = await analyzeAllClassSubmissions(managedClass.id);
      if (failed) toast.error(`${updated} analyzed; ${failed} temporarily unavailable. Submissions preserved.`);
      else toast.success(`Analysis complete. ${updated} submissions processed.`);
      await Promise.all([
        loadTeacherOverview(),
        loadTeacherAnalytics(),
        loadNotifications(),
        loadClassManagerData(managedClass.id),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to analyze submissions.";
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeSubmission = async (submissionId: string) => {
    if (!online) {
      toast.error("Internet access is required to analyze submissions.");
      return;
    }

    if (!managedClass || isAnalyzing || analyzingSubmissionId) {
      return;
    }

    setAnalyzingSubmissionId(submissionId);

    try {
      const result = await analyzeSingleSubmission(submissionId);
      const confidenceSuffix =
        typeof result.confidenceScore === "number"
          ? ` (${result.confidenceScore.toFixed(2)}% confidence)`
          : "";

      if (result.analysisDetails?.analysisStatus === "failed") toast.error("AI detection temporarily unavailable.");
      else toast.success(`Submission analyzed${confidenceSuffix}.`);
      await Promise.all([
        loadTeacherOverview(),
        loadTeacherAnalytics(),
        loadNotifications(),
        loadClassManagerData(managedClass.id),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to analyze submission.";
      toast.error(message);
    } finally {
      setAnalyzingSubmissionId(null);
    }
  };

  const handleAcceptEnrollmentRequest = async (request: EnrollmentRequest) => {
    if (!online) {
      toast.error("Internet access is required to review enrollment requests.");
      return;
    }

    setReviewingEnrollmentRequestId(request.id);

    try {
      await reviewEnrollmentRequest(request.id, "accepted");
      toast.success(`${request.studentName ?? "Student"} is now enrolled.`);
      await Promise.all([
        loadEnrollmentRequests(),
        loadTeacherOverview(),
        managedClass?.id === request.classId
          ? loadClassManagerData(request.classId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to accept enrollment request.";
      toast.error(message);
    } finally {
      setReviewingEnrollmentRequestId(null);
    }
  };

  const handleRejectEnrollmentRequest = async (
    request: EnrollmentRequest,
    rejectionNote?: string,
  ) => {
    if (!online) {
      toast.error("Internet access is required to review enrollment requests.");
      return;
    }

    setReviewingEnrollmentRequestId(request.id);

    try {
      await reviewEnrollmentRequest(request.id, "rejected", rejectionNote);
      toast.success("Enrollment request rejected.");
      await loadEnrollmentRequests();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to reject enrollment request.";
      toast.error(message);
    } finally {
      setReviewingEnrollmentRequestId(null);
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

    navigate("/auth/login_screen", { replace: true });
  };

  const renderSettings = () => (
    <TeacherSettingsPanel
      onAccountDeleted={() => navigate("/auth/login_screen", { replace: true })}
    />
  );

  const openCreateClassModal = () => {
    if (!online) {
      toast.error("Internet access is required to create a class.");
      return;
    }

    setIsCreateModalOpen(true);
  };

  if (isInitialDashboardLoading) {
    return <DashboardSkeleton role="teacher" darkMode={darkMode} />;
  }

  return (
    <div
      className="role-theme-page h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle("teacher", darkMode)}
    >
      <TeacherSidebar
        items={[...SIDEBAR_ITEMS]}
        footerItems={[...SUPPORT_SIDEBAR_ITEMS]}
        footerLabel={SUPPORT_SIDEBAR_LABEL}
        activeSection={activeSection}
        mobileOpen={mobileSidebarOpen}
        onSelect={(selectedSection) => goToSection(selectedSection)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <header className="workspace-header fixed left-0 right-0 top-0 z-10 h-20 border-b theme-border bg-[color-mix(in_srgb,var(--app-bg)_78%,transparent)] backdrop-blur-md md:left-20">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setMobileSidebarOpen(true)}
              className="theme-ring inline-flex h-10 w-10 items-center justify-center rounded-xl border theme-border text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <AppLogo variant="icon" iconClassName="hidden h-10 w-10 rounded-xl sm:grid" />
            <div className="min-w-0">
              <p className="text-xs theme-muted">
                Teacher Panel - {SECTION_LABELS[activeSection]}
              </p>
              <p className="truncate text-base font-semibold text-[var(--app-text)] sm:text-lg">
                {welcomeGreeting}, {teacherName}
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
              onNotificationClick={handleOpenNotification}
            />
            <Avatar className="h-9 w-9 border theme-border">
              {user?.profileImageUrl ? (
                <AvatarImage src={user.profileImageUrl} alt={teacherName} />
              ) : null}
              <AvatarFallback className="text-xs font-semibold text-[var(--app-text)]">
                {getDisplayInitials(teacherName)}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main
        ref={mainScrollRef}
        data-route-scroll-container
        className="workspace-content fixed inset-x-0 bottom-0 top-20 overflow-y-auto px-4 py-6 pb-10 sm:px-6 md:left-20"
      >
        <div className="mx-auto max-w-6xl">
          {activeSection === "home" && <><AcademicReviewPanel darkMode={darkMode} /><div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border theme-border p-4"><div><p className="font-semibold">Official Subjects</p><p className="text-sm theme-muted">View the curriculum for each department and year level. Designated staff can add and edit subjects.</p></div><Button variant="outline" onClick={() => goToSection('subjects')}>Open Subjects</Button></div><div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border theme-border p-4"><p className="font-semibold">Student Enrollment Requests: {enrollmentRequests.filter(r => r.status === 'pending').length} class approvals / {academicIntents.filter(r => r.teacher_status !== 'rejected').length} COR reviews</p><Button onClick={() => goToSection('uploads')}>Review Enrollment Requests</Button></div></>}
          {activeSection === "subjects" && <TeacherSubjectsPage />}
          {activeSection === "home" && (
            <TeacherHomeSection
              isLoading={isLoadingOverview}
              isLoadingAnalytics={isLoadingAnalytics}
              classCount={classes.length}
              studentCount={overviewStudents.length}
              activityCount={overviewActivities.length}
              upcomingCount={upcomingActivities.length}
              analytics={analytics}
              onCreateClass={openCreateClassModal}
              onOpenSection={goToSection}
              onOpenIntegrityAnalytics={() =>
                navigate("/teacher/integrity-analytics")
              }
            />
          )}

          {activeSection === "classes" && (
            <TeacherClassesSection
              classes={classes}
              isLoading={isLoadingOverview}
              latestCreatedCode={latestCreatedCode}
              copiedCode={copiedCode}
              onCreateClass={openCreateClassModal}
              onCopyCode={(code) => void handleCopyCode(code)}
              onManageClass={(classroom) => void openClassManager(classroom)}
            />
          )}

          {activeSection === "submissions" && (
            <TeacherSubmissionsSection
              classes={classes}
              isLoadingClasses={isLoadingOverview}
              online={online}
              onAnalyzed={() => { void Promise.all([loadTeacherAnalytics(), loadNotifications()]); }}
            />
          )}

          {activeSection === "students" && (
            <TeacherStudentsSection
              students={overviewStudents}
              isLoading={isLoadingOverview}
            />
          )}

          {activeSection === "uploads" && (
            <TeacherUploadsSection
              key={location.key}
              academicIntents={academicIntents}
              reviewingAcademicId={reviewingAcademicId}
              onReviewAcademic={(intent,status,note)=>void handleReviewAcademicCor(intent,status,note)}
              focusIntentId={searchParams.get('intent')||String(academicIntents.find(i=>String(i.class_id)===searchParams.get('class'))?.id||'')}
              focusRequestId={searchParams.get('request')||enrollmentRequests.find(r=>r.classId===searchParams.get('class'))?.id}
              darkMode={darkMode}
              requests={enrollmentRequests}
              isLoading={isLoadingEnrollmentRequests}
              reviewingId={reviewingEnrollmentRequestId}
              onRefresh={() => void loadEnrollmentRequests()}
              onAccept={(request) => void handleAcceptEnrollmentRequest(request)}
              onReject={(request, rejectionNote) =>
                void handleRejectEnrollmentRequest(request, rejectionNote)
              }
            />
          )}

          {activeSection === "activities" && (
            <TeacherActivitiesSection
              activities={overviewActivities}
              isLoading={isLoadingOverview}
              onOpenActivity={(activity) =>
                navigate(`/teacher/activities/${activity.id}`)
              }
            />
          )}

          {activeSection === "upcoming" && (
            <TeacherUpcomingSection
              upcomingActivities={upcomingActivities}
              isLoading={isLoadingOverview}
            />
          )}

          {activeSection === "settings" && renderSettings()}
          {activeSection === "about" && <AboutTrueSightPage />}
        </div>
      </main>

      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.button
              className="absolute inset-0 bg-[var(--sidebar-backdrop)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="theme-surface relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl"
            >
              <div className="border-b theme-border px-6 py-5">
                <p className="text-sm font-medium theme-title">
                  Create a new class
                </p>
                <h3 className="mt-1 text-xl font-bold text-[var(--app-text)]">
                  Generate a student join code
                </h3>
              </div>

              <form onSubmit={handleCreateClass} className="space-y-4 p-6">
                <AcademicSelectors value={classAcademics} onChange={value => { setClassAcademics(value); setClassSubjectId(''); }} />
                <SemesterSelect value={classSemester} onChange={value => { setClassSemester(value); setClassSubjectId(''); }} />
                <CurriculumSubjectSelect selection={classAcademics} semester={classSemester} value={classSubjectId} onChange={setClassSubjectId} />
                <p className="text-sm theme-muted">The class name and course code come from your selected official subject. A unique student join code is generated when you create the class.</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--app-text)]">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Short class overview for students"
                    rows={4}
                    className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] px-3 py-2 text-sm text-[var(--app-text)]"
                    required
                  />
                </div>

                <div className="rounded-2xl border border-dashed theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4 text-sm theme-muted">
                  The system generates a unique code so students can join this
                  class.
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      resetCreateClassForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreatingClass || !online || !classSubjectId} title={!online ? "Internet access is required." : undefined}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isCreatingClass ? "Creating..." : "Create Class"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TeacherClassManagerModal
        open={isClassManagerOpen}
        classroom={managedClass}
        loading={isLoadingClassManager}
        activities={classActivities}
        students={classStudents}
        submissions={classSubmissions}
        activityForm={activityForm}
        isCreatingActivity={isCreatingActivity}
        isPreparingAttachment={isPreparingActivityAttachment}
        attachmentProgress={activityAttachmentProgress}
        isAnalyzing={isAnalyzing}
        analyzingSubmissionId={analyzingSubmissionId}
        expandedSubmissionId={expandedSubmissionId}
        focusedActivityId={activityId ?? null}
        onClassroomUpdated={() => { if (managedClass) void Promise.all([loadClassManagerData(managedClass.id), loadTeacherOverview()]); }}
        onClose={closeClassManager}
        onAnalyzeAll={handleAnalyzeAll}
        onAnalyzeSubmission={(submissionId) =>
          void handleAnalyzeSubmission(submissionId)
        }
        onOpenSubmissionPage={(submissionId) =>
          navigate(`/teacher/submissions/${submissionId}`)
        }
        onOpenDocumentPreview={(submissionId) =>
          navigate(`/documents/submission/${submissionId}`)
        }
        onOpenAnalysisPage={(submissionId) =>
          navigate(`/teacher/submissions/${submissionId}/analysis`)
        }
        onSubmitActivity={handleCreateActivity}
        onSelectAttachment={(file) => void handleSelectActivityAttachment(file)}
        onClearAttachment={clearActivityAttachment}
        onChangeActivityForm={(patch) =>
          setActivityForm((previous) => ({
            ...previous,
            ...patch,
          }))
        }
        onToggleSubmission={(submissionId) =>
          setExpandedSubmissionId((current) =>
            current === submissionId ? null : submissionId,
          )
        }
      />
    </div>
  );
}
