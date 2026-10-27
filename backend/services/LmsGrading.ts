import { ensureCollegeSchema, verifyCollegeEnrollment } from './CollegeEnrollment.js';
import pool from '../config/db.js';
import { extractTextFromSubmissionFile } from './FileTextExtractor.js';

export function invalid(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

export type AssessmentRequirements = { minimumWords?: number; minimumParagraphs?: number; requiredPhrases?: string[] };
export type Criterion = { id: string; title: string; description: string; maxPoints: number; aiEnabled?: boolean; guidance?: string; assessment?: AssessmentRequirements };
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const percentage = (score: number, max: number) => round(score / max * 100);
export function points(value: unknown, max = 10000, allowRounding = false): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') invalid('A numeric score is required.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || (!allowRounding && round(n) !== n)) invalid(`Score must be between 0 and ${max}, with at most two decimal places.`);
  return round(n);
}
export function rubric(value: unknown): Criterion[] {
  if (!Array.isArray(value)) invalid('Rubric must be a list of criteria.');
  const active = value.filter(c => {
    if (!c || typeof c !== 'object') return true;
    const emptyChecks = c.assessment === undefined || (c.assessment && typeof c.assessment === 'object' && !Array.isArray(c.assessment)
      && Object.values(c.assessment).every(v => v === undefined || (Array.isArray(v) && v.every(p => typeof p === 'string' && !p.trim()))));
    return Boolean(String(c.title ?? '').trim() || String(c.description ?? '').trim() || !['', undefined, 0].includes(c.maxPoints) || c.guidance || !emptyChecks);
  });
  if (active.length > 100) invalid('Rubric must contain at most 100 active criteria.');
  const ids = new Set<string>();
  const titles = new Set<string>();
  const result = active.map((c) => {
    if (!c || typeof c !== 'object') invalid('Invalid criterion.');
    const id = String(c.id ?? '').trim();
    const title = String(c.title ?? '').trim();
    const description = String(c.description ?? '').trim();
    if (!id || id.length > 80 || ids.has(id) || !title || title.length > 255 || description.length > 10000) invalid('Each criterion needs a unique ID and a title (maximum 255 characters). Descriptions may contain up to 10,000 characters.');
    ids.add(id);
    if (titles.has(title.toLocaleLowerCase())) invalid('Use a distinct name for each criterion.');
    titles.add(title.toLocaleLowerCase());
    const maxPoints = points(c.maxPoints);
    if (maxPoints <= 0) invalid('Criterion maximum points must be greater than zero.');
    const criterion: Criterion = { id, title, description, maxPoints };
    if (c.aiEnabled !== undefined) {
      if (typeof c.aiEnabled !== 'boolean') invalid('AI assistance must be enabled or disabled for each criterion.');
      criterion.aiEnabled = c.aiEnabled;
    }
    if (c.guidance !== undefined) {
      if (typeof c.guidance !== 'string' || c.guidance.length > 10000) invalid('Criterion guidance must contain at most 10,000 characters.');
      criterion.guidance = c.guidance.trim();
    }
    if (c.assessment !== undefined) {
      if (!c.assessment || typeof c.assessment !== 'object' || Array.isArray(c.assessment)) invalid('Invalid criterion requirements.');
      const requirements: AssessmentRequirements = {};
      for (const key of ['minimumWords', 'minimumParagraphs'] as const) {
        const n = c.assessment[key];
        if (n !== undefined) {
          if (!Number.isInteger(n) || n < 1 || n > (key === 'minimumWords' ? 100000 : 1000)) invalid('Requirement counts must be positive whole numbers within the displayed limits.');
          requirements[key] = n;
        }
      }
      if (c.assessment.requiredPhrases !== undefined) {
        if (!Array.isArray(c.assessment.requiredPhrases) || c.assessment.requiredPhrases.length > 30 || c.assessment.requiredPhrases.some(p => typeof p !== 'string' || p.length > 200 || !/[\p{L}\p{N}]/u.test(p))) invalid('Use at most 30 nonempty required phrases, each with at most 200 characters.');
        requirements.requiredPhrases = [...new Set<string>(c.assessment.requiredPhrases.map(p => p.trim()))];
      }
      criterion.assessment = requirements;
    }
    return criterion;
  });
  if (round(result.reduce((s, c) => s + c.maxPoints, 0)) > 10000) invalid('Rubric total cannot exceed 10,000 points.');
  return result;
}
export function compute(criteria: Criterion[], scores: unknown) {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) invalid('Score every rubric criterion.');
  if (Object.keys(scores).length !== criteria.length) invalid('Score every rubric criterion, without extra criteria.');
  const values: Record<string, number> = Object.create(null);
  for (const c of criteria) {
    if (!Object.hasOwn(scores, c.id)) invalid(`Score required for ${c.title}.`);
    values[c.id] = points(scores[c.id], c.maxPoints);
  }
  return { scores: values, total: round(Object.values(values).reduce((s, n) => s + n, 0)) };
}
export function gradeLevel(value: unknown): string {
  if (typeof value !== 'string') invalid('Grade level must use the school\'s official text label.');
  const level = String(value ?? '').trim();
  if (!level || level.length > 80) invalid('An official grade level is required (maximum 80 characters).');
  return level;
}
export function eligibility(studentLevel: string | null, classLevel: string | null, open = true) {
  if (!studentLevel?.trim()) return 'Enrollment unavailable. Your official grade level has not been assigned. Please contact the school office.';
  if (!classLevel?.trim()) return 'Enrollment unavailable. This class has no assigned grade level. Please contact the teacher.';
  if (!open) return 'Enrollment unavailable. This class is closed to new enrollment.';
  if (studentLevel.trim().toLocaleLowerCase() !== classLevel.trim().toLocaleLowerCase()) return `Enrollment unavailable. This subject is assigned to ${classLevel}, while your current grade level is ${studentLevel}. Please select a subject corresponding to your grade level.`;
  return null;
}
export async function verifyEnrollment(db: Pick<typeof pool, 'query'>, classId: number, studentId: number, selection?: unknown) {
  return verifyCollegeEnrollment(db, classId, studentId, selection);
}

export const publicRubric = (criteria: Criterion[]) => criteria.map(({ id, title, description, maxPoints }) => ({ id, title, description, maxPoints }));
export function scoringEnabled(value: unknown, criteria: Criterion[]) {
  if (value !== undefined && typeof value !== 'boolean') invalid('AI-assisted scoring must be enabled or disabled.');
  if (value === true && !criteria.length) invalid('Add at least one rubric criterion before enabling assisted scoring.');
  return value === true;
}

export type RubricAssessment = {
  method: 'teacher_configured_objective_checks_v1';
  status: 'complete' | 'partial' | 'requires_teacher' | 'disabled' | 'analysis_unavailable';
  generatedAt: string; analysisReference: { submissionId: number; submittedVersion: number; detectorType: string | null; analysisStatus: string | null };
  criteria: { criterionId: string; score: number | null; maxPoints: number; status: 'suggested' | 'requires_teacher'; explanation: string; evidence: { requirement: string; observed: string; met: boolean }[] }[];
  suggestedTotal: number | null; suggestedPercentage: number | null; partialTotal: number; totalPossible: number;
  limitations: string;
};

/** Uses only explicit, teacher-configured standards. Detector probabilities are never grading inputs. */
export function assessContent(criteria: Criterion[], text: string | null, context: {
  enabled: boolean; analyzed: boolean; submissionType: string; submissionId: number; submittedVersion: number; detectorType?: string; analysisStatus?: string;
}): RubricAssessment {
  const wordCount = text?.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const paragraphCount = text?.trim().split(/\r?\n\s*\r?\n/).filter(p => p.trim()).length ?? 0;
  const normalized = (s: string) => s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normalizedText = ` ${normalized(text ?? '')} `;
  const rows: RubricAssessment['criteria'] = criteria.map(c => {
    const evidence: RubricAssessment['criteria'][number]['evidence'] = [];
    let explanation = '';
    if (!context.enabled || !c.aiEnabled) explanation = 'Assistance is disabled for this activity or criterion.';
    else if (!context.analyzed) explanation = 'A completed saved analysis is required before suggesting scores.';
    else if (!['essay', 'file'].includes(context.submissionType) || !text?.trim()) explanation = 'Readable essay or document content is required. This format needs teacher evaluation.';
    else {
      const requirements = c.assessment ?? {};
      if (requirements.minimumWords) evidence.push({ requirement: `At least ${requirements.minimumWords} words`, observed: `${wordCount} words`, met: wordCount >= requirements.minimumWords });
      if (requirements.minimumParagraphs) evidence.push({ requirement: `At least ${requirements.minimumParagraphs} paragraphs separated by blank lines`, observed: `${paragraphCount} paragraphs`, met: paragraphCount >= requirements.minimumParagraphs });
      for (const phrase of requirements.requiredPhrases ?? []) evidence.push({ requirement: `Contains phrase: ${phrase}`, observed: normalizedText.includes(` ${normalized(phrase)} `) ? 'Found in the submission' : 'Not found in the submission', met: normalizedText.includes(` ${normalized(phrase)} `) });
      if (!evidence.length) explanation = 'No measurable standards are configured. Content quality, correctness, coherence, and originality require teacher evaluation; detection probabilities cannot establish them.';
    }
    if (explanation) return { criterionId: c.id, score: null, maxPoints: c.maxPoints, status: 'requires_teacher', explanation, evidence };
    const satisfied = evidence.filter(e => e.met).length;
    return { criterionId: c.id, score: round(c.maxPoints * satisfied / evidence.length), maxPoints: c.maxPoints, status: 'suggested', explanation: `${satisfied} of ${evidence.length} teacher-configured requirements met. Each requirement has an equal share of this criterion's points.`, evidence };
  });
  const complete = rows.length > 0 && rows.every(r => r.score !== null);
  const partialTotal = round(rows.reduce((sum, r) => sum + (r.score ?? 0), 0));
  const totalPossible = round(criteria.reduce((sum, c) => sum + c.maxPoints, 0));
  return {
    method: 'teacher_configured_objective_checks_v1',
    status: !context.enabled ? 'disabled' : !context.analyzed ? 'analysis_unavailable' : complete ? 'complete' : rows.some(r => r.score !== null) ? 'partial' : 'requires_teacher',
    generatedAt: new Date().toISOString(), analysisReference: { submissionId: context.submissionId, submittedVersion: context.submittedVersion, detectorType: context.detectorType ?? null, analysisStatus: context.analysisStatus ?? null },
    criteria: rows, suggestedTotal: complete ? partialTotal : null, suggestedPercentage: complete ? percentage(partialTotal, totalPossible) : null, partialTotal, totalPossible,
    limitations: 'Local objective checks, not a semantic grading model. Phrase presence does not establish correctness or originality. No grading confidence is inferred from detection confidence. All suggestions require teacher review and approval.',
  };
}

export async function assessSubmission(submission: any, analysis: Record<string, any>): Promise<RubricAssessment> {
  let text: string | null = submission.submission_type === 'essay' ? submission.content_text ?? null : null;
  if (submission.ai_scoring_enabled && submission.submission_type === 'file' && analysis.analysisStatus === 'completed') {
    try { text = await extractTextFromSubmissionFile({ fileName: submission.file_name, fileType: submission.file_type, fileDataUrl: submission.file_data_url }); }
    catch { /* Unsupported/unreadable documents require teacher evaluation; never fabricate text. */ }
  }
  return assessContent(rubric(submission.rubric ?? []), text, {
    enabled: submission.ai_scoring_enabled === true, analyzed: analysis.analysisStatus === 'completed', submissionType: submission.submission_type,
    submissionId: Number(submission.id), submittedVersion: Number(submission.submitted_version), detectorType: analysis.detectorType, analysisStatus: analysis.analysisStatus,
  });
}

export async function ensureLmsSchema() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_level VARCHAR(80), ADD COLUMN IF NOT EXISTS section VARCHAR(120);
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS grade_level VARCHAR(80), ADD COLUMN IF NOT EXISTS enrollment_open BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS rubric JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS ai_scoring_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE class_enrollment_requests ADD COLUMN IF NOT EXISTS declared_grade_level VARCHAR(80);
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rubric_scores JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS computed_score NUMERIC(7,2),
      ADD COLUMN IF NOT EXISTS score_overridden BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS adjustment_note TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_assessment JSONB,
      ADD COLUMN IF NOT EXISTS grade_approved BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE submissions ALTER COLUMN grade_approved SET DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS submission_grade_history (
      id BIGSERIAL PRIMARY KEY, submission_id INTEGER NOT NULL, activity_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL, changed_by INTEGER, changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      previous_grade JSONB NOT NULL, saved_grade JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submission_grade_history_activity_idx ON submission_grade_history(activity_id);
    CREATE OR REPLACE FUNCTION truesight_audit_grade() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF ROW(OLD.teacher_score, OLD.teacher_grade, OLD.teacher_comments, OLD.teacher_remarks, OLD.rubric_scores, OLD.computed_score, OLD.score_overridden, OLD.adjustment_note, OLD.evaluated_at, OLD.grade_approved)
        IS DISTINCT FROM ROW(NEW.teacher_score, NEW.teacher_grade, NEW.teacher_comments, NEW.teacher_remarks, NEW.rubric_scores, NEW.computed_score, NEW.score_overridden, NEW.adjustment_note, NEW.evaluated_at, NEW.grade_approved) THEN
        INSERT INTO submission_grade_history (submission_id, activity_id, student_id, changed_by, previous_grade, saved_grade)
        VALUES (OLD.id, OLD.activity_id, OLD.student_id, COALESCE(NULLIF(current_setting('truesight.actor_id', true), '')::INTEGER, NEW.evaluated_by),
          jsonb_build_object('score', OLD.teacher_score, 'grade', OLD.teacher_grade, 'comments', OLD.teacher_comments, 'remarks', OLD.teacher_remarks, 'scores', OLD.rubric_scores, 'computed', OLD.computed_score, 'override', OLD.score_overridden, 'note', OLD.adjustment_note, 'version', OLD.submitted_version, 'evaluatedAt', OLD.evaluated_at, 'approved', OLD.grade_approved, 'aiAssessment', OLD.ai_assessment),
          jsonb_build_object('score', NEW.teacher_score, 'grade', NEW.teacher_grade, 'comments', NEW.teacher_comments, 'remarks', NEW.teacher_remarks, 'scores', NEW.rubric_scores, 'computed', NEW.computed_score, 'override', NEW.score_overridden, 'note', NEW.adjustment_note, 'version', NEW.submitted_version, 'evaluatedAt', NEW.evaluated_at, 'approved', NEW.grade_approved, 'aiAssessment', NEW.ai_assessment));
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS truesight_grade_audit ON submissions;
    CREATE TRIGGER truesight_grade_audit BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION truesight_audit_grade();
  `);
  await ensureCollegeSchema();
}
