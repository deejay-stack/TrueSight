import pool from '../config/db.js';
import { invalid } from './LmsGrading.js';

export const DEPARTMENTS = [
  ['BSIT', 'Bachelor of Science in Information Technology'], ['BSHM', 'Bachelor of Science in Hospitality Management'],
  ['BSCRIM', 'Bachelor of Science in Criminology'], ['BSED', 'Bachelor of Secondary Education'], ['BEED', 'Bachelor of Elementary Education'],
] as const;
export const YEAR_LEVELS = [1, 2, 3, 4].map((id, i) => ({ id, label: ['1st Year', '2nd Year', '3rd Year', '4th Year'][i] }));
export function semesterSelection(value: unknown = 1): number {
  if (value !== 1 && value !== 2) invalid('Select First Semester or Second Semester.');
  return value as number;
}
export function academicSelection(body: any) {
  const departmentCode = typeof body.departmentCode === 'string' ? body.departmentCode.trim().toUpperCase() : '';
  const yearLevel = body.yearLevel;
  if (!DEPARTMENTS.some(([code]) => code === departmentCode) || !Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4) invalid('Select a valid department and year level from the available options.');
  return { departmentCode, yearLevel: Number(yearLevel) };
}
export function collegeEligibility(profile: any, classroom: any, selection?: any): string | null {
  if (!classroom.enrollment_open) return 'This class is closed to new enrollment.';
  if (!classroom.department_code || !classroom.year_level) return 'This class needs an authorized department and year-level assignment before enrollment.';
  if (!profile.department_code || !profile.year_level) return 'Academic verification required. Request verification of your department and year level before enrolling.';
  if (selection && (selection.departmentCode !== profile.department_code || selection.yearLevel !== Number(profile.year_level))) return 'Your selected department or year level does not match your officially verified academic profile. Request a correction if needed.';
  if (profile.department_code !== classroom.department_code) return `This subject belongs to the ${classroom.department_code} department. Your officially assigned department is ${profile.department_code}.`;
  if (Number(profile.year_level) !== Number(classroom.year_level)) return `This subject belongs to ${YEAR_LEVELS[Number(classroom.year_level) - 1]?.label} ${classroom.department_code}. Your current verified year level is ${YEAR_LEVELS[Number(profile.year_level) - 1]?.label}. You cannot enroll in this subject. Please select a subject assigned to your year level.`;
  return null;
}
export async function verifyCollegeEnrollment(db: Pick<typeof pool, 'query'>, classId: number, studentId: number, body: any) {
  const selection = academicSelection(body);
  await requireSubjectEligibility(db, classId, studentId, selection);
  return selection;
}

// Canonical department codes are existing foreign keys; year IDs are the existing 1..4 values.
export const curriculumJoin = `LEFT JOIN subjects subject ON subject.id=c.subject_id
  LEFT JOIN curriculum_subjects curriculum ON curriculum.subject_id=c.subject_id AND curriculum.department_code=c.department_code AND curriculum.year_level=c.year_level AND curriculum.semester=c.semester`;
export const curriculumColumns = `c.subject_id,c.semester,subject.code AS subject_code,subject.name AS subject_name,
  (subject.active=TRUE AND curriculum.active=TRUE) AS curriculum_active`;
export function subjectEligibility(profile: any, classroom: any, selection?: any) {
  const message = collegeEligibility(profile, classroom, selection);
  const reason = message || (!classroom.subject_id || classroom.curriculum_active !== true
    ? 'This class has no active official subject curriculum assignment for its department, year level and semester. Authorized staff must configure it before new enrollment.' : null);
  return { eligible: !reason, code: !reason ? 'ELIGIBLE' : message ? (!profile.department_code || !profile.year_level ? 'ACADEMIC_VERIFICATION_REQUIRED' : 'ACADEMIC_RESTRICTION') : 'CURRICULUM_NOT_CONFIGURED',
    message: reason, requiredDepartment: classroom.department_code ?? null, requiredYearLevel: classroom.year_level ?? null,
    semester: classroom.semester ?? 1, subjectId: classroom.subject_id ?? null, subjectCode: classroom.subject_code ?? null, subjectName: classroom.subject_name ?? null };
}
export async function requireSubjectEligibility(db: Pick<typeof pool, 'query'>, classId: number, studentId: number, selection?: any) {
  const classroom = (await db.query('SELECT * FROM classes WHERE id=$1 FOR SHARE', [classId])).rows[0];
  const profile = (await db.query('SELECT department_code,year_level,section FROM users WHERE id=$1 FOR SHARE', [studentId])).rows[0];
  if (!profile || !classroom) invalid('Student or class not found.', 404);
  // Hold these locks through request creation/approval so curriculum edits cannot race admission.
  const subject = classroom.subject_id ? (await db.query('SELECT * FROM subjects WHERE id=$1 FOR SHARE', [classroom.subject_id])).rows[0] : null;
  const assignment = subject ? (await db.query('SELECT active FROM curriculum_subjects WHERE subject_id=$1 AND department_code=$2 AND year_level=$3 AND semester=$4 FOR SHARE', [subject.id, classroom.department_code, classroom.year_level, classroom.semester])).rows[0] : null;
  const eligibility = subjectEligibility(profile, { ...classroom, subject_code: subject?.code, subject_name: subject?.name, curriculum_active: subject?.active === true && assignment?.active === true }, selection);
  if (!eligibility.eligible) throw Object.assign(new Error(eligibility.message), { statusCode: 403, eligibility });
  return { profile, classroom, eligibility };
}
export async function requireClassSubject(db: Pick<typeof pool, 'query'>, subjectId: unknown, selection: { departmentCode: string; yearLevel: number }, semester = 1) {
  if (!Number.isSafeInteger(subjectId) || Number(subjectId) < 1) invalid('Select an official curriculum subject before opening enrollment.');
  const subject = (await db.query('SELECT id,active FROM subjects WHERE id=$1 FOR SHARE', [subjectId])).rows[0];
  const assignment = (await db.query('SELECT active FROM curriculum_subjects WHERE subject_id=$1 AND department_code=$2 AND year_level=$3 AND semester=$4 FOR SHARE', [subjectId, selection.departmentCode, selection.yearLevel, semesterSelection(semester)])).rows[0];
  if (!subject?.active || !assignment?.active) invalid('This subject has no active curriculum assignment for the selected department, year and semester. Ask designated curriculum staff to configure it.', 403);
  return subject.id as number;
}
export async function ensureCollegeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (code VARCHAR(8) PRIMARY KEY, name VARCHAR(150) NOT NULL);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS department_code VARCHAR(8) REFERENCES departments(code),
      ADD COLUMN IF NOT EXISTS year_level SMALLINT CHECK(year_level BETWEEN 1 AND 4),
      ADD COLUMN IF NOT EXISTS can_verify_academics BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS department_code VARCHAR(8) REFERENCES departments(code),
      ADD COLUMN IF NOT EXISTS year_level SMALLINT CHECK(year_level BETWEEN 1 AND 4);
    ALTER TABLE class_enrollment_requests ADD COLUMN IF NOT EXISTS declared_department VARCHAR(8) REFERENCES departments(code),
      ADD COLUMN IF NOT EXISTS declared_year SMALLINT CHECK(declared_year BETWEEN 1 AND 4);
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS analysis_request_id UUID;
    CREATE TABLE IF NOT EXISTS academic_verification_requests (
      id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      department_code VARCHAR(8) NOT NULL REFERENCES departments(code), year_level SMALLINT NOT NULL CHECK(year_level BETWEEN 1 AND 4), section VARCHAR(120),
      original_department VARCHAR(8), original_year SMALLINT, status VARCHAR(15) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      note TEXT, reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS academic_verification_pending ON academic_verification_requests(student_id) WHERE status='pending';
    ALTER TABLE academic_verification_requests ADD COLUMN IF NOT EXISTS original_section VARCHAR(120);
    ALTER TABLE class_enrollment_requests ADD COLUMN IF NOT EXISTS declared_section VARCHAR(120),
      ADD COLUMN IF NOT EXISTS academic_request_id INTEGER REFERENCES academic_verification_requests(id) ON DELETE SET NULL;
    UPDATE users SET year_level=CASE LOWER(TRIM(grade_level)) WHEN '1st year' THEN 1 WHEN '2nd year' THEN 2 WHEN '3rd year' THEN 3 WHEN '4th year' THEN 4 WHEN '4rth year' THEN 4 END
      WHERE year_level IS NULL AND LOWER(TRIM(grade_level)) IN ('1st year','2nd year','3rd year','4th year','4rth year');
    UPDATE classes SET year_level=CASE LOWER(TRIM(grade_level)) WHEN '1st year' THEN 1 WHEN '2nd year' THEN 2 WHEN '3rd year' THEN 3 WHEN '4th year' THEN 4 WHEN '4rth year' THEN 4 END
      WHERE year_level IS NULL AND LOWER(TRIM(grade_level)) IN ('1st year','2nd year','3rd year','4th year','4rth year');
  `);
  for (const [code, name] of DEPARTMENTS) await pool.query('INSERT INTO departments(code,name) VALUES($1,$2) ON CONFLICT(code) DO NOTHING', [code, name]);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_curriculum BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE CHECK(code=UPPER(TRIM(code)) AND code<>''),
      name VARCHAR(200) NOT NULL CHECK(TRIM(name)<>''), active BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS curriculum_subjects (
      id SERIAL PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES subjects(id), department_code VARCHAR(8) NOT NULL REFERENCES departments(code),
      year_level SMALLINT NOT NULL CHECK(year_level BETWEEN 1 AND 4), active BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(subject_id,department_code,year_level)
    );
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects(id);
    ALTER TABLE class_enrollment_requests ADD COLUMN IF NOT EXISTS requested_subject_id INTEGER REFERENCES subjects(id);
    ALTER TABLE academic_verification_requests ADD COLUMN IF NOT EXISTS cor_file_name TEXT, ADD COLUMN IF NOT EXISTS cor_file_type TEXT,
      ADD COLUMN IF NOT EXISTS cor_file_size INTEGER, ADD COLUMN IF NOT EXISTS cor_data_url TEXT;
    ALTER TABLE curriculum_subjects ADD COLUMN IF NOT EXISTS semester SMALLINT NOT NULL DEFAULT 1 CHECK(semester IN (1,2));
    ALTER TABLE curriculum_subjects DROP CONSTRAINT IF EXISTS curriculum_subjects_subject_id_department_code_year_level_key;
    CREATE UNIQUE INDEX IF NOT EXISTS curriculum_subjects_semester_unique ON curriculum_subjects(subject_id,department_code,year_level,semester);
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS semester SMALLINT NOT NULL DEFAULT 1 CHECK(semester IN (1,2));
    ALTER TABLE class_enrollment_requests ADD COLUMN IF NOT EXISTS requested_semester SMALLINT NOT NULL DEFAULT 1 CHECK(requested_semester IN (1,2));
    CREATE TABLE IF NOT EXISTS curriculum_change_history (
      id BIGSERIAL PRIMARY KEY, entity_table TEXT NOT NULL CHECK(entity_table IN ('subjects','curriculum_subjects')),
      record_id INTEGER NOT NULL, operation TEXT NOT NULL, before_data JSONB, after_data JSONB,
      changed_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS curriculum_change_record ON curriculum_change_history(entity_table,record_id,id);
    CREATE OR REPLACE FUNCTION record_curriculum_change() RETURNS TRIGGER LANGUAGE plpgsql AS $curriculum_history$
    BEGIN
      IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
      INSERT INTO curriculum_change_history(entity_table,record_id,operation,before_data,after_data,changed_by)
        VALUES(TG_TABLE_NAME,NEW.id,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),NEW.updated_by);
      RETURN NEW;
    END;
    $curriculum_history$;
    CREATE OR REPLACE TRIGGER subjects_change_history AFTER INSERT OR UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION record_curriculum_change();
    CREATE OR REPLACE TRIGGER assignments_change_history AFTER INSERT OR UPDATE ON curriculum_subjects FOR EACH ROW EXECUTE FUNCTION record_curriculum_change();
    INSERT INTO curriculum_change_history(entity_table,record_id,operation,after_data,changed_by)
      SELECT 'subjects',s.id,'BASELINE',to_jsonb(s),s.updated_by FROM subjects s
      WHERE NOT EXISTS(SELECT 1 FROM curriculum_change_history h WHERE h.entity_table='subjects' AND h.record_id=s.id);
    INSERT INTO curriculum_change_history(entity_table,record_id,operation,after_data,changed_by)
      SELECT 'curriculum_subjects',a.id,'BASELINE',to_jsonb(a),a.updated_by FROM curriculum_subjects a
      WHERE NOT EXISTS(SELECT 1 FROM curriculum_change_history h WHERE h.entity_table='curriculum_subjects' AND h.record_id=a.id);
    CREATE TABLE IF NOT EXISTS academic_enrollment_intents (
      id SERIAL PRIMARY KEY,academic_request_id INTEGER NOT NULL REFERENCES academic_verification_requests(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,subject_id INTEGER NOT NULL REFERENCES subjects(id),
      semester SMALLINT NOT NULL CHECK(semester IN (1,2)),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(academic_request_id,class_id)
    );
    ALTER TABLE academic_enrollment_intents
      ADD COLUMN IF NOT EXISTS teacher_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(teacher_status IN ('pending','accepted','rejected')),
      ADD COLUMN IF NOT EXISTS review_note TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS enrollment_request_id INTEGER REFERENCES class_enrollment_requests(id) ON DELETE SET NULL;
  `);
}
