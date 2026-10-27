import { API_BASE_URL } from '../config/api';

export type AssessmentRequirements = { minimumWords?: number; minimumParagraphs?: number; requiredPhrases?: string[] };
export type RubricCriterion = { id: string; title: string; description: string; maxPoints: number; aiEnabled?: boolean; guidance?: string; assessment?: AssessmentRequirements };
export type RubricAssessment = {
  method: string; status: string; generatedAt: string;
  analysisReference: { submissionId: number; submittedVersion: number; detectorType: string | null; analysisStatus: string | null };
  criteria: { criterionId: string; score: number | null; maxPoints: number; status: string; explanation: string; evidence: { requirement: string; observed: string; met: boolean }[] }[];
  suggestedTotal: number | null; suggestedPercentage: number | null; partialTotal: number; totalPossible: number; limitations: string;
};
export type RatingReport = {
  departmentCode?: string | null; yearLevel?: number | null;
  studentName: string; studentId: string; gradeLevel: string | null; section: string | null;
  subject: string; activity: string; teacherName: string; submittedAt: string;
  criteria: (RubricCriterion & { earned: number | null })[];
  computedScore: number | null; maxScore: number; finalScore: number; percentage: number;
  rating: string | null; feedback: string | null; remarks: string | null; overridden: boolean;
  adjustmentNote: string | null; gradedAt: string; status: string; exportedAt: string;
};
// Grades and eligibility are always fetched fresh; exports never use the offline cache.
export async function lmsRequest<T>(path: string, body?: Record<string, unknown>, method?: 'POST'): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/classes${path}`, {
    credentials: 'include', cache: 'no-store', method: method ?? (body ? 'PATCH' : 'GET'),
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'Unable to load classroom data.');
  return data;
}
export const fetchRating = async (id: string) => (await lmsRequest<{ report: RatingReport }>(`/activities/${id}/rating`)).report;
