import axios, { type AxiosProgressEvent } from "axios";
import { API_BASE_URL } from "../config/api";
import {
  createOfflineActionError,
  isConnectionAvailable,
  isLikelyConnectivityError,
  markBackendReachable,
  markBackendUnreachable,
} from "./connectivity";
import {
  hasOfflineCache,
  readOfflineCache,
  writeOfflineCache,
} from "./offlineCache";

export type TeacherClass = {
  id: string;
  name: string;
  code: string;
  description: string;
  students: number;
  assignments: number;
  instructorId: string;
  createdAt: string;
  teacherName: string;
  teacherProfileImageUrl: string | null;
};

export type EnrolledClass = Omit<
  TeacherClass,
  "teacherName" | "teacherProfileImageUrl"
> & {
  joinedAt: string;
  teacherName: string;
  teacherProfileImageUrl: string | null;
};

export type EnrollmentRequestStatus = "pending" | "accepted" | "rejected";

export type EnrollmentRequest = {
  id: string;
  classId: string;
  studentId: string;
  status: EnrollmentRequestStatus;
  className: string;
  classCode: string;
  teacherName: string | null;
  teacherProfileImageUrl: string | null;
  studentName: string | null;
  studentEmail: string | null;
  studentProfileImageUrl: string | null;
  corFileName: string;
  corFileType: string | null;
  corFileSize: number | null;
  corDataUrl: string | null;
  rejectionNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type ClassJoinLookup = {
  classroom: TeacherClass;
  enrollment: { id: string; joinedAt: string } | null;
  request: {
    id: string;
    status: EnrollmentRequestStatus;
    rejectionNote: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  } | null;
};

export type ActivitySubmissionType = "essay" | "file" | "image" | "code";

export type ActivityNotificationType =
  | "new_activity"
  | "upcoming_deadline"
  | "new_submission";

export type ActivityNotification = {
  id: string;
  type: ActivityNotificationType;
  severity: "info" | "warning";
  classId: string;
  className: string;
  activityId: string;
  activityTitle: string;
  title: string;
  message: string;
  eventAt: string;
  dueDate: string | null;
  createdAt: string | null;
  status: "read" | "unread";
  readAt: string | null;
  relatedSubmissionId: string | null;
};

export type ExplainabilitySignal = {
  id: string;
  label: string;
  score: number;
  explanation: string;
};

export type SuspiciousSentence = {
  sentenceNumber: number;
  sentence: string;
  aiSuspicionScore: number;
  reasons: string[];
};

export type HighlightedToken = {
  token: string;
  aiProbability: number;
};

export type SubmissionAnalysisDetails = {
  source?: string;
  verdict?: string;
  reasons?: string[];
  metrics?: Record<string, unknown>;
  aiProbability?: number;
  humanProbability?: number;
  confidenceScore?: number;
  confidenceLevel?: string;
  writingConsistencyScore?: number;
  humanRevisionLikelihood?: number;
  suspiciousSentences?: SuspiciousSentence[];
  highlightedTokens?: HighlightedToken[];
  explainabilitySignals?: ExplainabilitySignal[];
  [key: string]: unknown;
};

export type StudentActivitySubmission = {
  id: string;
  status: string;
  aiProbability: number | null;
  humanProbability: number | null;
  confidenceScore: number | null;
  isAIGenerated: boolean | null;
  analysisDetails: SubmissionAnalysisDetails | null;
  submittedAt: string | null;
  updatedAt: string | null;
  contentText: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  submittedVersion: number;
  teacherComments: string | null;
  teacherRemarks: string | null;
  teacherGrade: string | null;
  teacherScore: number | null;
  evaluatedAt: string | null;
};

export type ActivityAttachment = {
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  documentId: string;
};

export type ClassActivity = {
  id: string;
  classId: string;
  className: string | null;
  classCode: string | null;
  title: string;
  instructor: string;
  description: string;
  submissionType: ActivitySubmissionType;
  allowResubmission: boolean;
  maxScore: number;
  programmingLanguage: string | null;
  starterCode: string | null;
  attachment: ActivityAttachment | null;
  teacherName: string | null;
  teacherProfileImageUrl: string | null;
  dueDate: string;
  createdAt: string;
  submissionCount: number;
  mySubmission: StudentActivitySubmission | null;
};

export type SubmissionHistoryEntry = {
  id: string;
  submissionId: string;
  activityId: string;
  studentId: string;
  version: number;
  contentText: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  status: string;
  submittedAt: string;
};

export type ActivityDetail = {
  activity: ClassActivity;
  mySubmission: StudentActivitySubmission | null;
  history: SubmissionHistoryEntry[];
};

export type EnrolledStudent = {
  id: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  joinedAt: string;
  submissionCount: number;
};

export type TeacherOverviewStudent = {
  id: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  firstJoinedAt: string;
  lastJoinedAt: string;
  classCount: number;
  submissionCount: number;
};

export type TeacherOverviewActivity = {
  id: string;
  classId: string;
  className: string;
  title: string;
  instructor: string;
  description: string;
  submissionType: ActivitySubmissionType;
  maxScore: number;
  programmingLanguage: string | null;
  starterCode: string | null;
  dueDate: string;
  createdAt: string;
  submissionCount: number;
};

export type TeacherOverview = {
  classes: TeacherClass[];
  students: TeacherOverviewStudent[];
  activities: TeacherOverviewActivity[];
  upcoming: TeacherOverviewActivity[];
};

export type TeacherAnalyticsTotals = {
  totalSubmissions: number;
  flaggedOutputs: number;
  averageIntegrityScore: number | null;
};

export type TeacherSuspiciousClass = {
  classId: string;
  className: string;
  submissions: number;
  flaggedOutputs: number;
  averageAiProbability: number | null;
  averageIntegrityScore: number | null;
};

export type TeacherMonthlyTrend = {
  month: string;
  monthKey: string;
  submissions: number;
  flaggedOutputs: number;
  averageIntegrityScore: number | null;
};

export type TeacherAnalytics = {
  totals: TeacherAnalyticsTotals;
  topSuspiciousClasses: TeacherSuspiciousClass[];
  monthlyTrends: TeacherMonthlyTrend[];
};

export type ClassSubmission = {
  id: string;
  activityId: string;
  classId: string | null;
  className: string | null;
  activityTitle: string;
  submissionType: ActivitySubmissionType;
  maxScore: number;
  programmingLanguage: string | null;
  starterCode: string | null;
  dueDate: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  contentText: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  fileDataUrl: string | null;
  status: string;
  aiProbability: number | null;
  humanProbability: number | null;
  confidenceScore: number | null;
  isAIGenerated: boolean | null;
  analysisDetails: SubmissionAnalysisDetails | null;
  submittedVersion: number;
  teacherComments: string | null;
  teacherRemarks: string | null;
  teacherGrade: string | null;
  teacherScore: number | null;
  evaluatedAt: string | null;
  submittedAt: string;
  updatedAt: string;
};

export type SubmissionEvaluation = {
  comments: string | null;
  remarks: string | null;
  grade: string | null;
  score: number | null;
  evaluatedAt: string | null;
};

export type DocumentPreviewType = "activity-attachment" | "submission";

export type PreviewDocument = {
  id: string;
  kind: DocumentPreviewType;
  title: string;
  className: string | null;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  dataUrl: string | null;
  textContent: string | null;
  status: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  ownerName: string | null;
};

export type SubmissionAnalysisResult = {
  id: string;
  status: string;
  aiProbability: number | null;
  humanProbability: number | null;
  confidenceScore: number | null;
  isAIGenerated: boolean | null;
  analysisDetails: SubmissionAnalysisDetails | null;
  updatedAt: string;
};

export type UploadProgressCallback = (progress: number) => void;

type ApiClass = {
  id: number;
  name: string;
  code: string;
  description: string;
  teacher_id: number;
  student_count: number;
  assignment_count: number;
  created_at: string;
  joined_at?: string;
  teacher_name?: string;
  teacher_profile_image_url?: string | null;
};

type ApiEnrollmentStatus = "pending" | "accepted" | "rejected";

type ApiEnrollmentRequest = {
  id: number;
  class_id: number;
  student_id: number;
  status: ApiEnrollmentStatus;
  class_name?: string;
  class_code?: string;
  teacher_name?: string | null;
  teacher_profile_image_url?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  student_profile_image_url?: string | null;
  cor_file_name?: string | null;
  cor_file_type?: string | null;
  cor_file_size?: number | string | null;
  cor_data_url?: string | null;
  rejection_note?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
};

type ApiActivity = {
  id: number;
  class_id: number;
  class_name?: string;
  class_code?: string;
  title: string;
  instructor: string;
  description: string;
  submission_type: ActivitySubmissionType;
  allow_resubmission?: boolean;
  max_score?: number | string | null;
  programming_language?: string | null;
  starter_code?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | string | null;
  teacher_name?: string | null;
  teacher_profile_image_url?: string | null;
  due_date: string;
  created_at: string;
  submission_count?: number;
  submission_id?: number | null;
  submission_status?: string | null;
  ai_probability?: number | null;
  is_ai_generated?: boolean | null;
  analysis_details?: SubmissionAnalysisDetails | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  content_text?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | string | null;
  submitted_version?: number | string | null;
  teacher_comments?: string | null;
  teacher_remarks?: string | null;
  teacher_grade?: string | null;
  teacher_score?: number | string | null;
  evaluated_at?: string | null;
};

type ApiStudent = {
  id: number;
  name: string;
  email: string;
  profile_image_url?: string | null;
  joined_at: string;
  submission_count: number;
};

type ApiTeacherOverviewStudent = {
  id: number;
  name: string;
  email: string;
  profile_image_url?: string | null;
  first_joined_at: string;
  last_joined_at: string;
  class_count: number;
  submission_count: number;
};

type ApiTeacherOverviewActivity = {
  id: number;
  class_id: number;
  class_name: string;
  title: string;
  instructor: string;
  description: string;
  submission_type: ActivitySubmissionType;
  max_score?: number | string | null;
  programming_language?: string | null;
  starter_code?: string | null;
  due_date: string;
  created_at: string;
  submission_count: number;
};

type ApiSubmission = {
  id: number;
  activity_id: number;
  class_id?: number;
  class_name?: string;
  activity_title: string;
  submission_type: ActivitySubmissionType;
  due_date: string;
  student_id: number;
  student_name: string;
  student_email: string;
  content_text: string | null;
  file_name: string | null;
  file_type?: string | null;
  file_size?: number | string | null;
  file_data_url?: string | null;
  status: string;
  ai_probability: number | null;
  is_ai_generated: boolean | null;
  analysis_details: SubmissionAnalysisDetails | null;
  submitted_version?: number | string | null;
  max_score?: number | string | null;
  programming_language?: string | null;
  starter_code?: string | null;
  teacher_comments?: string | null;
  teacher_remarks?: string | null;
  teacher_grade?: string | null;
  teacher_score?: number | string | null;
  evaluated_at?: string | null;
  submitted_at: string;
  updated_at: string;
};

type ApiSubmissionHistory = {
  id: number;
  submission_id: number;
  activity_id: number;
  student_id: number;
  version: number | string;
  content_text: string | null;
  file_name: string | null;
  file_type?: string | null;
  file_size?: number | string | null;
  status: string;
  submitted_at: string;
};

type ApiPreviewDocument = {
  id: string | number;
  kind: DocumentPreviewType;
  title: string;
  className?: string | null;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | string | null;
  dataUrl?: string | null;
  textContent?: string | null;
  status?: string | null;
  createdAt?: string | null;
  submittedAt?: string | null;
  ownerName?: string | null;
};

type ApiTeacherSuspiciousClass = {
  classId: string;
  className: string;
  submissions: number;
  flaggedOutputs: number;
  averageAiProbability: number | null;
  averageIntegrityScore: number | null;
};

type ApiTeacherMonthlyTrend = {
  month: string;
  monthKey: string;
  submissions: number;
  flaggedOutputs: number;
  averageIntegrityScore: number | null;
};

type ApiTeacherAnalytics = {
  totals: {
    totalSubmissions: number;
    flaggedOutputs: number;
    averageIntegrityScore: number | null;
  };
  topSuspiciousClasses: ApiTeacherSuspiciousClass[];
  monthlyTrends: ApiTeacherMonthlyTrend[];
};

type ApiActivityNotification = {
  id: string;
  type: ActivityNotificationType;
  severity: "info" | "warning";
  classId: string | number;
  className: string;
  activityId: string | number;
  activityTitle: string;
  title: string;
  message: string;
  eventAt: string;
  dueDate?: string | null;
  createdAt?: string | null;
  status?: "read" | "unread";
  readAt?: string | null;
  relatedSubmissionId?: string | number | null;
};

const API_URL = `${API_BASE_URL}/classes`;
const CLASS_CACHE_SCOPE = "classes";

const getRequestCacheKey = (path: string) => `GET:${path}`;

const readCachedRequest = <T,>(path: string) =>
  readOfflineCache<T>(CLASS_CACHE_SCOPE, getRequestCacheKey(path));

const writeCachedRequest = <T,>(path: string, value: T) => {
  writeOfflineCache(CLASS_CACHE_SCOPE, getRequestCacheKey(path), value);
};

export const hasCachedClassRequest = (path: string) =>
  hasOfflineCache(CLASS_CACHE_SCOPE, getRequestCacheKey(path));

async function request<T>(
  path: string,
  options?: {
    method?: "DELETE" | "GET" | "PATCH" | "POST";
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const method = options?.method ?? "GET";

  if (!isConnectionAvailable()) {
    if (method === "GET") {
      const cached = readCachedRequest<T>(path);
      if (cached) return cached;
    }

    throw createOfflineActionError();
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    markBackendReachable();

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      throw new Error(
        typeof payload.message === "string"
          ? payload.message
          : "Request failed.",
      );
    }

    if (method === "GET") {
      writeCachedRequest(path, payload as T);
    }

    return payload as T;
  } catch (error) {
    if (isLikelyConnectivityError(error)) {
      markBackendUnreachable();

      if (method === "GET") {
        const cached = readCachedRequest<T>(path);
        if (cached) return cached;
      }
    }

    throw error;
  }
}

async function postWithUploadProgress<T>(
  path: string,
  body: Record<string, unknown>,
  onUploadProgress: UploadProgressCallback,
): Promise<T> {
  if (!isConnectionAvailable()) {
    throw createOfflineActionError();
  }

  try {
    onUploadProgress(1);

    const response = await axios.post<T>(`${API_URL}${path}`, body, {
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!event.total) {
          return;
        }

        const progress = Math.max(
          1,
          Math.min(99, Math.round((event.loaded / event.total) * 100)),
        );
        onUploadProgress(progress);
      },
    });

    markBackendReachable();
    onUploadProgress(100);

    return response.data;
  } catch (error) {
    if (isLikelyConnectivityError(error)) {
      markBackendUnreachable();
    }

    if (axios.isAxiosError(error)) {
      const data = error.response?.data as { message?: unknown } | undefined;
      throw new Error(
        typeof data?.message === "string"
          ? data.message
          : error.message || "Request failed.",
      );
    }

    throw error;
  }
}

const mapTeacherClass = (item: ApiClass): TeacherClass => ({
  id: String(item.id),
  name: item.name,
  code: item.code,
  description: item.description,
  students: Number(item.student_count ?? 0),
  assignments: Number(item.assignment_count ?? 0),
  instructorId: String(item.teacher_id),
  createdAt: item.created_at,
  teacherName: item.teacher_name ?? "Unknown Teacher",
  teacherProfileImageUrl: item.teacher_profile_image_url ?? null,
});

const mapEnrolledClass = (item: ApiClass): EnrolledClass => ({
  id: String(item.id),
  name: item.name,
  code: item.code,
  description: item.description,
  students: Number(item.student_count ?? 0),
  assignments: Number(item.assignment_count ?? 0),
  instructorId: String(item.teacher_id),
  createdAt: item.created_at,
  joinedAt: item.joined_at ?? item.created_at,
  teacherName: item.teacher_name ?? "Unknown Teacher",
  teacherProfileImageUrl: item.teacher_profile_image_url ?? null,
});

const mapEnrollmentStatus = (status: string): EnrollmentRequestStatus => {
  if (status === "accepted" || status === "rejected") {
    return status;
  }

  return "pending";
};

const mapEnrollmentRequest = (
  item: ApiEnrollmentRequest,
): EnrollmentRequest => ({
  id: String(item.id),
  classId: String(item.class_id),
  studentId: String(item.student_id),
  status: mapEnrollmentStatus(item.status),
  className: item.class_name ?? "Unknown Class",
  classCode: item.class_code ?? "",
  teacherName: item.teacher_name ?? null,
  teacherProfileImageUrl: item.teacher_profile_image_url ?? null,
  studentName: item.student_name ?? null,
  studentEmail: item.student_email ?? null,
  studentProfileImageUrl: item.student_profile_image_url ?? null,
  corFileName: item.cor_file_name ?? "Certificate of Registration",
  corFileType: item.cor_file_type ?? null,
  corFileSize: asNumber(item.cor_file_size),
  corDataUrl: item.cor_data_url ?? null,
  rejectionNote: item.rejection_note ?? null,
  submittedAt: item.submitted_at,
  reviewedAt: item.reviewed_at ?? null,
});

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const extractAnalysisNumbers = (details: SubmissionAnalysisDetails | null) => ({
  humanProbability: asNumber(details?.humanProbability),
  confidenceScore: asNumber(details?.confidenceScore),
});

const mapStudentSubmission = (item: ApiActivity): StudentActivitySubmission | null => {
  if (!item.submission_id) {
    return null;
  }

  const analysisDetails = item.analysis_details ?? null;
  const { humanProbability, confidenceScore } = extractAnalysisNumbers(analysisDetails);

  return {
    id: String(item.submission_id),
    status: item.submission_status ?? "pending",
    aiProbability: asNumber(item.ai_probability),
    humanProbability,
    confidenceScore,
    isAIGenerated:
      typeof item.is_ai_generated === "boolean" ? item.is_ai_generated : null,
    analysisDetails,
    submittedAt: item.submitted_at ?? null,
    updatedAt: item.updated_at ?? null,
    contentText: item.content_text ?? null,
    fileName: item.file_name ?? null,
    fileType: item.file_type ?? null,
    fileSize: asNumber(item.file_size),
    submittedVersion: asNumber(item.submitted_version) ?? 1,
    teacherComments: item.teacher_comments ?? null,
    teacherRemarks: item.teacher_remarks ?? null,
    teacherGrade: item.teacher_grade ?? null,
    teacherScore: asNumber(item.teacher_score),
    evaluatedAt: item.evaluated_at ?? null,
  };
};

const mapActivity = (item: ApiActivity): ClassActivity => ({
  id: String(item.id),
  classId: String(item.class_id),
  className: item.class_name ?? null,
  classCode: item.class_code ?? null,
  title: item.title,
  instructor: item.instructor,
  description: item.description,
  submissionType: item.submission_type,
  allowResubmission: item.allow_resubmission !== false,
  maxScore: asNumber(item.max_score) ?? 100,
  programmingLanguage: item.programming_language ?? null,
  starterCode: item.starter_code ?? null,
  attachment: item.attachment_name
    ? {
        fileName: item.attachment_name,
        fileType: item.attachment_type ?? null,
        fileSize: asNumber(item.attachment_size),
        documentId: String(item.id),
      }
    : null,
  teacherName: item.teacher_name ?? null,
  teacherProfileImageUrl: item.teacher_profile_image_url ?? null,
  dueDate: item.due_date,
  createdAt: item.created_at,
  submissionCount: Number(item.submission_count ?? 0),
  mySubmission: mapStudentSubmission(item),
});

const mapHistoryEntry = (item: ApiSubmissionHistory): SubmissionHistoryEntry => ({
  id: String(item.id),
  submissionId: String(item.submission_id),
  activityId: String(item.activity_id),
  studentId: String(item.student_id),
  version: asNumber(item.version) ?? 1,
  contentText: item.content_text,
  fileName: item.file_name,
  fileType: item.file_type ?? null,
  fileSize: asNumber(item.file_size),
  status: item.status,
  submittedAt: item.submitted_at,
});

const mapStudent = (item: ApiStudent): EnrolledStudent => ({
  id: String(item.id),
  name: item.name,
  email: item.email,
  profileImageUrl: item.profile_image_url ?? null,
  joinedAt: item.joined_at,
  submissionCount: Number(item.submission_count ?? 0),
});

const mapTeacherOverviewStudent = (
  item: ApiTeacherOverviewStudent,
): TeacherOverviewStudent => ({
  id: String(item.id),
  name: item.name,
  email: item.email,
  profileImageUrl: item.profile_image_url ?? null,
  firstJoinedAt: item.first_joined_at,
  lastJoinedAt: item.last_joined_at,
  classCount: Number(item.class_count ?? 0),
  submissionCount: Number(item.submission_count ?? 0),
});

const mapTeacherOverviewActivity = (
  item: ApiTeacherOverviewActivity,
): TeacherOverviewActivity => ({
  id: String(item.id),
  classId: String(item.class_id),
  className: item.class_name,
  title: item.title,
  instructor: item.instructor,
  description: item.description,
  submissionType: item.submission_type,
  maxScore: asNumber(item.max_score) ?? 100,
  programmingLanguage: item.programming_language ?? null,
  starterCode: item.starter_code ?? null,
  dueDate: item.due_date,
  createdAt: item.created_at,
  submissionCount: Number(item.submission_count ?? 0),
});

const mapTeacherAnalytics = (payload: ApiTeacherAnalytics): TeacherAnalytics => ({
  totals: {
    totalSubmissions: Number(payload.totals?.totalSubmissions ?? 0),
    flaggedOutputs: Number(payload.totals?.flaggedOutputs ?? 0),
    averageIntegrityScore: asNumber(payload.totals?.averageIntegrityScore),
  },
  topSuspiciousClasses: (payload.topSuspiciousClasses ?? []).map((item) => ({
    classId: item.classId,
    className: item.className,
    submissions: Number(item.submissions ?? 0),
    flaggedOutputs: Number(item.flaggedOutputs ?? 0),
    averageAiProbability: asNumber(item.averageAiProbability),
    averageIntegrityScore: asNumber(item.averageIntegrityScore),
  })),
  monthlyTrends: (payload.monthlyTrends ?? []).map((item) => ({
    month: item.month,
    monthKey: item.monthKey,
    submissions: Number(item.submissions ?? 0),
    flaggedOutputs: Number(item.flaggedOutputs ?? 0),
    averageIntegrityScore: asNumber(item.averageIntegrityScore),
  })),
});

const mapNotification = (item: ApiActivityNotification): ActivityNotification => ({
  id: item.id,
  type: item.type,
  severity: item.severity === "warning" ? "warning" : "info",
  classId: String(item.classId),
  className: item.className,
  activityId: String(item.activityId),
  activityTitle: item.activityTitle,
  title: item.title,
  message: item.message,
  eventAt: item.eventAt,
  dueDate: item.dueDate ?? null,
  createdAt: item.createdAt ?? null,
  status: item.status === "read" ? "read" : "unread",
  readAt: item.readAt ?? null,
  relatedSubmissionId:
    item.relatedSubmissionId === null || item.relatedSubmissionId === undefined
      ? null
      : String(item.relatedSubmissionId),
});

const mapSubmission = (item: ApiSubmission): ClassSubmission => {
  const analysisDetails = item.analysis_details ?? null;
  const { humanProbability, confidenceScore } = extractAnalysisNumbers(analysisDetails);

  return {
    id: String(item.id),
    activityId: String(item.activity_id),
    classId: typeof item.class_id === "number" ? String(item.class_id) : null,
    className: item.class_name ?? null,
    activityTitle: item.activity_title,
    submissionType: item.submission_type,
    dueDate: item.due_date,
    studentId: String(item.student_id),
    studentName: item.student_name,
    studentEmail: item.student_email,
    contentText: item.content_text,
    fileName: item.file_name,
    fileType: item.file_type ?? null,
    fileSize: asNumber(item.file_size),
    fileDataUrl: item.file_data_url ?? null,
    status: item.status,
    aiProbability: asNumber(item.ai_probability),
    humanProbability,
    confidenceScore,
    isAIGenerated:
      typeof item.is_ai_generated === "boolean" ? item.is_ai_generated : null,
    analysisDetails,
    submittedVersion: asNumber(item.submitted_version) ?? 1,
    maxScore: asNumber(item.max_score) ?? 100,
    programmingLanguage: item.programming_language ?? null,
    starterCode: item.starter_code ?? null,
    teacherComments: item.teacher_comments ?? null,
    teacherRemarks: item.teacher_remarks ?? null,
    teacherGrade: item.teacher_grade ?? null,
    teacherScore: asNumber(item.teacher_score),
    evaluatedAt: item.evaluated_at ?? null,
    submittedAt: item.submitted_at,
    updatedAt: item.updated_at,
  };
};

const mapPreviewDocument = (item: ApiPreviewDocument): PreviewDocument => ({
  id: String(item.id),
  kind: item.kind,
  title: item.title,
  className: item.className ?? null,
  fileName: item.fileName,
  fileType: item.fileType ?? null,
  fileSize: asNumber(item.fileSize),
  dataUrl: item.dataUrl ?? null,
  textContent: item.textContent ?? null,
  status: item.status ?? null,
  createdAt: item.createdAt ?? null,
  submittedAt: item.submittedAt ?? null,
  ownerName: item.ownerName ?? null,
});

export async function fetchTeacherClasses(): Promise<TeacherClass[]> {
  const payload = await request<{ classes: ApiClass[] }>("/mine");
  return (payload.classes ?? []).map(mapTeacherClass);
}

export async function fetchTeacherOverview(): Promise<TeacherOverview> {
  const payload = await request<{
    classes: ApiClass[];
    students: ApiTeacherOverviewStudent[];
    activities: ApiTeacherOverviewActivity[];
    upcoming: ApiTeacherOverviewActivity[];
  }>("/teacher/overview");

  return {
    classes: (payload.classes ?? []).map(mapTeacherClass),
    students: (payload.students ?? []).map(mapTeacherOverviewStudent),
    activities: (payload.activities ?? []).map(mapTeacherOverviewActivity),
    upcoming: (payload.upcoming ?? []).map(mapTeacherOverviewActivity),
  };
}

export async function fetchTeacherAnalytics(): Promise<TeacherAnalytics> {
  const payload = await request<ApiTeacherAnalytics>("/teacher/analytics");
  return mapTeacherAnalytics(payload);
}

export async function fetchUserNotifications(): Promise<ActivityNotification[]> {
  const payload = await request<{ notifications: ApiActivityNotification[] }>(
    "/notifications",
  );

  return (payload.notifications ?? []).map(mapNotification);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await request<{ message: string }>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await request<{ message: string }>(`/notifications/${notificationId}`, {
    method: "DELETE",
  });
}

export async function createTeacherClass(input: {
  name: string;
  description: string;
  code: string;
}): Promise<TeacherClass> {
  const payload = await request<{ class: ApiClass }>("/", {
    method: "POST",
    body: input,
  });

  return mapTeacherClass(payload.class);
}

export async function lookupClassByCode(code: string): Promise<ClassJoinLookup> {
  const payload = await request<{
    class: ApiClass;
    enrollment: { id: number; joined_at: string } | null;
    request: {
      id: number;
      status: string;
      rejection_note?: string | null;
      submitted_at: string;
      reviewed_at?: string | null;
    } | null;
  }>("/join/lookup", {
    method: "POST",
    body: { code },
  });

  return {
    classroom: mapTeacherClass(payload.class),
    enrollment: payload.enrollment
      ? {
          id: String(payload.enrollment.id),
          joinedAt: payload.enrollment.joined_at,
        }
      : null,
    request: payload.request
      ? {
          id: String(payload.request.id),
          status: mapEnrollmentStatus(payload.request.status),
          rejectionNote: payload.request.rejection_note ?? null,
          submittedAt: payload.request.submitted_at,
          reviewedAt: payload.request.reviewed_at ?? null,
        }
      : null,
  };
}

export async function submitEnrollmentRequest(input: {
  code: string;
  corFileName: string;
  corFileType: string;
  corFileSize: number;
  corDataUrl: string;
}): Promise<EnrollmentRequest> {
  const payload = await request<{
    request: ApiEnrollmentRequest;
  }>("/join", {
    method: "POST",
    body: input,
  });

  return mapEnrollmentRequest(payload.request);
}

export async function fetchMyEnrollmentRequests(): Promise<EnrollmentRequest[]> {
  const payload = await request<{ requests: ApiEnrollmentRequest[] }>(
    "/enrollment-requests/mine",
  );
  return (payload.requests ?? []).map(mapEnrollmentRequest);
}

export async function fetchTeacherEnrollmentRequests(): Promise<
  EnrollmentRequest[]
> {
  const payload = await request<{ requests: ApiEnrollmentRequest[] }>(
    "/enrollment-requests",
  );
  return (payload.requests ?? []).map(mapEnrollmentRequest);
}

export async function reviewEnrollmentRequest(
  requestId: string,
  status: Exclude<EnrollmentRequestStatus, "pending">,
  rejectionNote?: string,
): Promise<EnrollmentRequest> {
  const payload = await request<{ request: ApiEnrollmentRequest }>(
    `/enrollment-requests/${requestId}`,
    {
      method: "PATCH",
      body: { status, rejectionNote },
    },
  );

  return mapEnrollmentRequest(payload.request);
}

export async function fetchEnrolledClasses(): Promise<EnrolledClass[]> {
  const payload = await request<{ classes: ApiClass[] }>("/enrolled");
  return (payload.classes ?? []).map(mapEnrolledClass);
}

export async function fetchClassActivities(classId: string): Promise<ClassActivity[]> {
  const payload = await request<{ activities: ApiActivity[] }>(`/${classId}/activities`);
  return (payload.activities ?? []).map(mapActivity);
}

export async function fetchActivityDetail(activityId: string): Promise<ActivityDetail> {
  const payload = await request<{
    activity: ApiActivity;
    submission: {
      id: number;
      activity_id: number;
      student_id: number;
      status: string;
      ai_probability: number | null;
      is_ai_generated: boolean | null;
      analysis_details: SubmissionAnalysisDetails | null;
      submitted_at: string | null;
      updated_at: string | null;
      content_text: string | null;
      file_name: string | null;
      file_type?: string | null;
      file_size?: number | string | null;
      submitted_version?: number | string | null;
      teacher_comments?: string | null;
      teacher_remarks?: string | null;
      teacher_grade?: string | null;
      teacher_score?: number | string | null;
      evaluated_at?: string | null;
    } | null;
    history: ApiSubmissionHistory[];
  }>(`/activities/${activityId}`);

  const activity = mapActivity({
    ...payload.activity,
    submission_id: payload.submission?.id ?? null,
    submission_status: payload.submission?.status ?? null,
    ai_probability: payload.submission?.ai_probability ?? null,
    is_ai_generated: payload.submission?.is_ai_generated ?? null,
    analysis_details: payload.submission?.analysis_details ?? null,
    submitted_at: payload.submission?.submitted_at ?? null,
    updated_at: payload.submission?.updated_at ?? null,
    content_text: payload.submission?.content_text ?? null,
    file_name: payload.submission?.file_name ?? null,
    file_type: payload.submission?.file_type ?? null,
    file_size: payload.submission?.file_size ?? null,
    submitted_version: payload.submission?.submitted_version ?? null,
    teacher_comments: payload.submission?.teacher_comments ?? null,
    teacher_remarks: payload.submission?.teacher_remarks ?? null,
    teacher_grade: payload.submission?.teacher_grade ?? null,
    teacher_score: payload.submission?.teacher_score ?? null,
    evaluated_at: payload.submission?.evaluated_at ?? null,
  });

  return {
    activity,
    mySubmission: activity.mySubmission,
    history: (payload.history ?? []).map(mapHistoryEntry),
  };
}

export async function createClassActivity(
  classId: string,
  input: {
    title: string;
    instructor: string;
    description: string;
    submissionType: ActivitySubmissionType;
    allowResubmission?: boolean;
    maxScore?: number;
    programmingLanguage?: string;
    starterCode?: string;
    attachmentName?: string;
    attachmentType?: string;
    attachmentSize?: number;
    attachmentDataUrl?: string;
    dueDate: string;
  },
): Promise<ClassActivity> {
  const payload = await request<{ activity: ApiActivity }>(`/${classId}/activities`, {
    method: "POST",
    body: input,
  });

  return mapActivity(payload.activity);
}

export async function submitActivitySubmission(
  activityId: string,
  input: {
    contentText?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    fileDataUrl?: string;
    extractedText?: string;
  },
  options?: {
    onUploadProgress?: UploadProgressCallback;
  },
): Promise<StudentActivitySubmission> {
  const path = `/activities/${activityId}/submissions`;
  const payload = options?.onUploadProgress
    ? await postWithUploadProgress<{
        submission: {
          id: number;
          status: string;
          ai_probability: number | null;
          is_ai_generated: boolean | null;
          analysis_details: SubmissionAnalysisDetails | null;
          submitted_at: string;
          updated_at: string;
          content_text: string | null;
          file_name: string | null;
          file_type?: string | null;
          file_size?: number | string | null;
          submitted_version?: number | string | null;
          teacher_comments?: string | null;
          teacher_remarks?: string | null;
          teacher_grade?: string | null;
          teacher_score?: number | string | null;
          evaluated_at?: string | null;
        };
      }>(path, input, options.onUploadProgress)
    : await request<{
    submission: {
      id: number;
      status: string;
      ai_probability: number | null;
      is_ai_generated: boolean | null;
      analysis_details: SubmissionAnalysisDetails | null;
      submitted_at: string;
      updated_at: string;
      content_text: string | null;
      file_name: string | null;
      file_type?: string | null;
      file_size?: number | string | null;
      submitted_version?: number | string | null;
      teacher_comments?: string | null;
      teacher_remarks?: string | null;
      teacher_grade?: string | null;
      teacher_score?: number | string | null;
      evaluated_at?: string | null;
    };
  }>(path, {
    method: "POST",
    body: input,
  });

  return {
    id: String(payload.submission.id),
    status: payload.submission.status,
    aiProbability: asNumber(payload.submission.ai_probability),
    humanProbability: asNumber(payload.submission.analysis_details?.humanProbability),
    confidenceScore: asNumber(payload.submission.analysis_details?.confidenceScore),
    isAIGenerated:
      typeof payload.submission.is_ai_generated === "boolean"
        ? payload.submission.is_ai_generated
        : null,
    analysisDetails: payload.submission.analysis_details,
    submittedAt: payload.submission.submitted_at,
    updatedAt: payload.submission.updated_at,
    contentText: payload.submission.content_text,
    fileName: payload.submission.file_name,
    fileType: payload.submission.file_type ?? null,
    fileSize: asNumber(payload.submission.file_size),
    submittedVersion: asNumber(payload.submission.submitted_version) ?? 1,
    teacherComments: payload.submission.teacher_comments ?? null,
    teacherRemarks: payload.submission.teacher_remarks ?? null,
    teacherGrade: payload.submission.teacher_grade ?? null,
    teacherScore: asNumber(payload.submission.teacher_score),
    evaluatedAt: payload.submission.evaluated_at ?? null,
  };
}

export async function unsubmitActivitySubmission(activityId: string): Promise<void> {
  await request<{ message: string }>(`/activities/${activityId}/submissions`, {
    method: "DELETE",
  });
}

export async function fetchClassStudents(classId: string): Promise<EnrolledStudent[]> {
  const payload = await request<{ students: ApiStudent[] }>(`/${classId}/students`);
  return (payload.students ?? []).map(mapStudent);
}

export async function fetchClassSubmissions(
  classId: string,
): Promise<ClassSubmission[]> {
  const payload = await request<{ submissions: ApiSubmission[] }>(
    `/${classId}/submissions`,
  );
  return (payload.submissions ?? []).map(mapSubmission);
}

export async function fetchSubmissionDetail(
  submissionId: string,
): Promise<ClassSubmission> {
  const payload = await request<{ submission: ApiSubmission }>(
    `/submissions/${submissionId}`,
  );

  return mapSubmission(payload.submission);
}

export async function saveSubmissionEvaluation(
  submissionId: string,
  input: {
    comments?: string;
    remarks?: string;
    grade?: string;
    score?: number | null;
  },
): Promise<SubmissionEvaluation> {
  const payload = await request<{
    submission: {
      teacher_comments?: string | null;
      teacher_remarks?: string | null;
      teacher_grade?: string | null;
      teacher_score?: number | string | null;
      evaluated_at?: string | null;
    };
  }>(`/submissions/${submissionId}/evaluation`, {
    method: "PATCH",
    body: input,
  });

  return {
    comments: payload.submission.teacher_comments ?? null,
    remarks: payload.submission.teacher_remarks ?? null,
    grade: payload.submission.teacher_grade ?? null,
    score: asNumber(payload.submission.teacher_score),
    evaluatedAt: payload.submission.evaluated_at ?? null,
  };
}

export async function fetchDocumentPreview(
  documentType: DocumentPreviewType,
  documentId: string,
): Promise<PreviewDocument> {
  const payload = await request<{ document: ApiPreviewDocument }>(
    `/documents/${documentType}/${documentId}`,
  );

  return mapPreviewDocument(payload.document);
}

export async function analyzeSingleSubmission(
  submissionId: string,
): Promise<SubmissionAnalysisResult> {
  const payload = await request<{
    submission: {
      id: number;
      status: string;
      ai_probability: number | null;
      is_ai_generated: boolean | null;
      analysis_details: SubmissionAnalysisDetails | null;
      updated_at: string;
    };
  }>(`/submissions/${submissionId}/analyze`, {
    method: "POST",
  });

  const analysisDetails = payload.submission.analysis_details ?? null;

  return {
    id: String(payload.submission.id),
    status: payload.submission.status,
    aiProbability: asNumber(payload.submission.ai_probability),
    humanProbability: asNumber(analysisDetails?.humanProbability),
    confidenceScore: asNumber(analysisDetails?.confidenceScore),
    isAIGenerated:
      typeof payload.submission.is_ai_generated === "boolean"
        ? payload.submission.is_ai_generated
        : null,
    analysisDetails,
    updatedAt: payload.submission.updated_at,
  };
}

export async function analyzeAllClassSubmissions(classId: string): Promise<{ updated: number; failed: number }> {
  const payload = await request<{ updated: number; failed?: number }>(`/${classId}/submissions/analyze`, {
    method: "POST",
  });

  return { updated: Number(payload.updated ?? 0), failed: Number(payload.failed ?? 0) };
}
