# Official subject curriculum and enrollment validation

Implemented 24 October 2026, Asia/Manila. This is the current enrollment policy. It supersedes the earlier policy that allowed class COR requests while official department/year information was missing. Analysis, grading, and previously approved class memberships retain their existing behavior.

> Recovery update: [27 overwritten subjects were recovered](curriculum-recovery-2026-10-24.md), restoring 31 BSIT First Semester subjects (10/9/4/8 by year). Saved names/codes now require explicit Edit existing subject, and database before/after history prevents silent loss of earlier values.

> Student form update: [Join Class now uses one academic/COR form with a semester selector](student-enrollment-form-fixes.md). The duplicate upper verification form is removed. The lower uploader supports academic-profile verification while official information is missing, and class submission only after eligibility succeeds.

## Root cause and inspection

Source inspection and the connected PostgreSQL schema confirmed that subjects were represented by class names and class department/year fields. There was no subject table, curriculum-assignment table, semester/term model, subject administration interface, or authorized irregular-student enrollment exception. Matching a student's profile to teacher-selected class fields could not prove that a subject belonged to the official curriculum. The prior request flow also allowed declarations to create pending class requests before official academic verification.

Existing classes, user academic profiles, canonical department foreign keys, year IDs 1–4, class codes, enrollment requests, membership tables, document viewers, academic reviewer permissions, and teacher approval are reused. The migration preserves existing subject records, class names, and join codes.

## Catalog and authorization

- `subjects` contains the canonical numeric subject ID, a unique uppercase/trimmed code, name, active flag, edit version, updater, and update time.
- `curriculum_subjects` explicitly associates a subject ID with an existing canonical `departments.code` foreign key, numeric year ID, and semester ID (1 or 2). A unique index prevents duplicate subject/department/year/semester assignments. Each mapping has an active flag, edit version, updater, and update time.
- A shared subject requires a separate authorized mapping for every applicable department/year/semester. Sharing a subject does not allow a student to enter a class in another department/year.
- The new `can_manage_curriculum` flag follows the existing narrow designated-personnel permission pattern. It defaults to false and is independent of `can_verify_academics`. No existing teacher or student automatically receives it. No web endpoint grants either permission.
- The dedicated **Subjects** sidebar page (`/teacher/teacher_screen/subjects`) displays **Official Subjects**, with instructions and a directly editable department/year table for designated curriculum staff. It supports search, adding subjects, assigning existing subjects, editing shared codes/names, deactivating/reactivating assignments, transactional Save changes, reloading after a conflict, and viewing the complete curriculum. Other teachers can browse the page in view-only mode. Teacher Home includes an **Open Subjects** shortcut.
- Ordinary class teachers can select existing active curriculum subjects for their own classes; they cannot edit the official catalog. Students receive only their official department/year's active subject list through `/eligible`.
- Conflicting edits return 409 using subject/mapping versions. A failed batch rolls back all its edits. Omitted rows are retained; deactivation never deletes memberships or historical requests.
- No sample subjects are seeded. First Semester and Second Semester are now explicitly supported at the user's request; no academic-year calendar or assumed current semester was introduced.

## Semester and class creation update

The existing database contained four active BSIT assignments, one in each year. The picker previously loaded the catalog only on mount and there was no semester field. All four original assignments were retained and migrated to **First Semester** as requested. No additional subjects were invented or inserted.

The Subjects page now filters and saves independently by department, year and semester. Choose **Second Semester** to enter its actual subjects, then Save changes. A subject offered in both semesters uses **Assign existing subject** to add its explicit second assignment. Deactivating a second-semester assignment does not deactivate its first-semester assignment.

Create Class now requires a department, year, semester and official subject. The picker includes every matching active subject, displays a count, refreshes when the selection changes or the window regains focus, and provides **Refresh subjects**. Multiple first- and second-semester subjects were verified through API and picker checks.

Manual **Class Name** and **Course Code** inputs have been removed. The backend derives the class name as `official subject code - official subject name` and generates a separate unique student join code. Concurrent join-code collisions are retried under database savepoints. The existing copy-code, lookup, COR submission, teacher approval and class access workflows continue to use that generated join code. Existing class names and codes are not bulk-renamed. Explicitly changing an existing class's linked subject updates that class's display name to the newly selected official subject.

Class settings, student subject/class listings, code lookup and teacher COR review display the semester. Enrollment and approval require an active mapping for the class's exact semester. Each request records its semester; changing the class's semester after submission blocks stale approval. Previously approved memberships and grades remain accessible. Official student records still determine department/year; no unsupported student-semester restriction is inferred.

## Enrollment and COR workflow

1. Join Class displays the student's official department/year/section while retaining confirmation controls and the independent academic-verification panel.
2. Code lookup returns limited public class/subject metadata, structured eligibility, and only the caller's own request/membership status. Verifying a code sends no teacher request or notification.
3. Eligibility requires an open class, official department/year, matching canonical student/class fields, a linked subject, an active subject and explicit active curriculum mapping, and matching confirmation fields at submission. Client-selected values cannot replace official records.
4. Class COR upload and submission are disabled until an eligible code is verified. Changing codes or becoming ineligible does not erase the stored COR draft. A clear restriction leaves the class-code input usable.
5. `POST /join` repeats authoritative validation before COR processing or request insertion. An ineligible attempt returns a structured `eligibility` object with a reason and the actual required department/year/subject. It creates no pending teacher request, membership, or notification.
6. A valid COR and eligible request are saved in the existing transaction. Section changes can still require designated academic review. Missing official department/year must be resolved independently before making a class request.
7. The teacher sees the requested official subject/code, required department/year, student information, COR, verification stage, and existing approve/reject controls. The requested subject ID is saved with the request and its original subject is shown even if the class subject later changes.
8. Approval revalidates the current official profile, current subject/mapping, open enrollment, original requested subject, section verification, COR, owning teacher, and request status. It rejects stale curriculum, profile, or class-subject changes. Relevant class/profile/subject/mapping locks are held through the transaction.
9. Existing approved memberships continue to authorize access regardless of subsequent curriculum or profile changes. Historical requests/CORs remain readable by their authorized owners/reviewers.

New students can submit a COR with an independent academic-profile verification request. They can also attach it to their own existing pending academic request if it has no saved COR. Saved academic CORs cannot be replaced through this attachment endpoint. The owner and designated academic reviewers can retrieve the protected `academic-cor` document; unrelated teachers, curriculum managers without reviewer permission, and other students cannot. Queue responses contain metadata, not image bytes. No OCR or automatic claim that the COR contains a requested subject was added; the teacher must compare the subject code against the document manually.

## Additive database migration

The existing idempotent `ensureCollegeSchema()` migration adds:

| Table | Addition |
| --- | --- |
| `subjects` | Canonical subject records with normalized unique codes and edit metadata |
| `curriculum_subjects` | Explicit unique subject/department/year/semester associations and edit metadata |
| `users` | `can_manage_curriculum BOOLEAN NOT NULL DEFAULT FALSE` |
| `classes` | Nullable `subject_id` foreign key and semester (default 1, checked 1 or 2) |
| `class_enrollment_requests` | Nullable `requested_subject_id` foreign key and `requested_semester` (default 1, checked 1 or 2) |
| `academic_verification_requests` | Private COR filename, MIME type, byte size, and data URL |
| `curriculum_change_history` | Transactional before/after snapshots from database triggers on subjects and curriculum assignments, plus idempotent existing-record baselines |

The migration ran against the configured local database through the normal protected class-route initialization during integration testing. It is safe to repeat and inserts no official curriculum. Existing enrollment and COR rows are retained. No model weights, analysis thresholds, grades, or historical memberships are migrated.

The semester migration replaces the old subject/department/year unique constraint with a unique subject/department/year/semester index. Existing rows receive semester 1 without deleting or copying assignments. Repeated migration was verified to preserve existing records.

Legacy classes remain unmapped until an owner selects their official subject; no mapping is guessed from the class name or class code. Missing/inactive mappings appear in the authorized configuration-issues list and deny new enrollment. The new Create Class interface requires a subject; legacy API requests creating an unmapped class remain closed to enrollment. Older pending requests without a recorded subject ID require rejection and a fresh eligible request; they are not deleted or silently assigned a subject. Previously accepted requests retain their membership access.

## Operator setup

1. Build/restart the backend and frontend. The normal authenticated class/academic options request initializes the additive schema on a fresh deployment.
2. An authorized database operator designates the intended school personnel account from the backend directory:

   ```powershell
   node manage-academics.mjs grant-curriculum TEACHER_ACCOUNT_ID
   ```

   Use `revoke-curriculum` to remove this permission. Academic reviewers continue to use the separate `grant-reviewer`/`revoke-reviewer` operations. After the user confirmed their account, **Kim Duero** was explicitly designated for curriculum editing to resolve the missing Add subject button. Other teacher accounts were left unchanged.
3. That account opens **Teacher Panel → Subjects** (or **Open Subjects** on Teacher Home), selects a department, year level and semester, clicks **Add subject**, enters the official code and name, keeps the assignment Active, and clicks **Save changes**. Repeat for all required department/year/semester combinations. Use **Assign existing subject** for legitimate shared subjects and mark incorrect assignments Inactive. A **View only** notice means the signed-in account lacks the curriculum permission from step 2.
4. Each class owner selects department/year/semester and the official subject when creating a class, then enters its description. The generated student join code appears on the class card. Existing classes can be linked through **Manage Class → Subject enrollment** using the same department/year/semester selection. The configuration-issues list identifies classes still requiring attention. A teacher can close an unchanged class even if its mapping was deactivated.
5. Students with missing official records request academic verification and optionally attach their COR independently. Designated reviewers verify those records before class enrollment is attempted.

### Add subject and save confirmation

The Add subject button was previously hidden for accounts without the designated curriculum permission; no actual school account initially had that permission. Kim Duero now has the permission at the user's explicit request. Refresh the Subjects page or choose **Refresh catalog** to load the current permission without signing in again.

**Add subject** and **Save changes** appear above the catalog table. Add subject opens and focuses a blank row. Enter its code/name and choose Save changes; incomplete rows show an error. On successful save the server commits the subject and department/year assignment in one database transaction and returns their persisted IDs and edit versions. The editor displays this authoritative result with a visible Saved message and clears the search so the saved row remains visible. Fresh catalog requests retrieve the same saved records. Other teachers see disabled editing buttons with an explanation; backend permission checks remain enforced.

## Validation results

Synthetic subjects and accounts were used only as test fixtures and removed afterward. No illustrative curriculum was installed.

| Official student department | 1st Year | 2nd Year | 3rd Year | 4th Year |
| --- | --- | --- | --- | --- |
| BSIT | Passed | Passed | Passed | Passed |
| BSHM | Passed | Passed | Passed | Passed |
| BSCRIM | Passed | Passed | Passed | Passed |
| BSED | Passed | Passed | Passed | Passed |
| BEED | Passed | Passed | Passed | Passed |

For every cell, both semesters were tested. Tests verified multiple saved subjects, filtered catalog and class lists, eligible code lookup, COR request creation/retrieval, teacher approval, membership, and duplicate prevention. For all 380 other department/year combinations, lookup reported ineligibility and manipulated direct requests were denied before COR submission with no teacher request created.

- `backend/tests/semester-integration.mjs`: **395 HTTP checks passed**, covering all 40 department/year/semester combinations, 100 synthetic subjects, multiple subjects per semester, persistence after fresh reads, derived class identity without name/code inputs, unique generated join codes, wrong-semester creation rejection, COR/approval, explicit same-subject mappings in both semesters, stale semester approvals, independent deactivation, idempotent migration and preserved historical access. Synthetic rows were removed afterward.

- `backend/tests/curriculum-integration.mjs`: **1,061 HTTP checks passed**, including persisted save-response IDs/versions matched against fresh catalog reads, edited-subject persistence and repeat-save duplicate prevention, all 20 valid combinations and 380 mismatches, missing mappings, shared subjects, catalog permission boundaries, normalized duplicate codes, atomic edit rollback, optimistic edit conflicts, simultaneous duplicate requests, mapping deactivation, changed official profiles, changed class subjects, preserved historical access/CORs, independent academic COR creation/attachment, and document privacy.
- `backend/tests/college-integration.mjs`: 42 HTTP checks plus the existing 20 combinations/380 mismatch assertions passed.
- `backend/tests/enrollment-workflow.mjs`: 51 HTTP checks passed; department/year must now be verified first, while the existing section verification, notifications, rejection/history and private COR access remain covered.
- `backend/tests/lms-integration.mjs`: 96 HTTP assertions passed, including teacher-controlled rubric grading, unpublished-grade privacy, reports, resubmissions, audit history, and historical class/grade access.
- `backend/tests/document-access.mjs`: COR ownership/teacher access and unrelated-reader denial passed.
- `backend/tests/integration.mjs`: real DeBERTa, CodeT5-BiLSTM, and EfficientNet inference passed. COR upload/reject/resubmit/approve, submission routing and persistence, concurrent analysis, failed analysis, batch routing, document privacy, unchanged grades/remarks/history, and no external Node detector requests passed.
- Backend detector/prediction/rubric/metric unit suites: **18 passed**. Frontend detection/preview unit suite: **6 passed**. Existing server-rendered LMS UI checks passed.
- Backend and frontend production builds passed. Targeted lint on modified frontend code passed with zero errors and the existing `openClassManager` hook-dependency warning. Vite retains its existing large-chunk advisory.

Browser interaction and visual layout still need a manual check in the target browser. Actual institutional curriculum entry, personnel designation, and explicit legacy class mappings are intentional manual setup requirements. No existing approved enrollment-exception mechanism was found or disabled. COR subject comparison remains an authorized manual review step.

## Files changed in this enhancement

Backend services/routes/operator tool:

- `backend/services/CollegeEnrollment.ts`
- `backend/services/EnrollmentWorkflow.ts`
- `backend/services/CorUpload.ts` (new shared COR validator)
- `backend/routes/curriculum.ts` (new protected catalog module)
- `backend/routes/classes.ts`
- `backend/routes/lms.ts`
- `backend/routes/academics.ts`
- `backend/manage-academics.mjs`

Frontend components/services:

- `frontend/src/components/CurriculumSubjectSelect.tsx` (new)
- `frontend/src/components/SemesterSelect.tsx`
- `frontend/src/utils/curriculum.ts`
- `frontend/src/components/AcademicVerificationPanel.tsx`
- `frontend/src/screens/teacher/components/CurriculumManager.tsx` (new)
- `frontend/src/screens/teacher/components/ClassEnrollmentSettings.tsx`
- `frontend/src/screens/teacher/components/AcademicReviewPanel.tsx`
- `frontend/src/screens/teacher/components/TeacherUploadsSection.tsx`
- `frontend/src/screens/teacher/components/TeacherClassesSection.tsx`
- `frontend/src/screens/teacher/components/TeacherClassManagerModal.tsx`
- `frontend/src/screens/teacher/TeacherScreen.tsx`
- `frontend/src/screens/teacher/TeacherSubjectsPage.tsx` (dedicated Subjects page)
- `frontend/src/screens/teacher/components/TeacherSidebar.tsx` (Subjects navigation)
- `frontend/src/screens/student/components/EligibleSubjects.tsx`
- `frontend/src/screens/student/StudentScreen.tsx`
- `frontend/src/screens/student/components/StudentClassCard.tsx`
- `frontend/src/services/classService.ts`

Tests/documentation:

- `backend/tests/curriculum-fixture.mjs` (new isolated synthetic fixture helper)
- `backend/tests/curriculum-integration.mjs` (new)
- `backend/tests/semester-integration.mjs`
- `backend/tests/college-integration.mjs`
- `backend/tests/enrollment-workflow.mjs`
- `backend/tests/lms-integration.mjs`
- `backend/tests/document-access.mjs`
- `backend/tests/integration.mjs`
- `frontend/tests/lms-ui.mjs` (multiple picker choices and semester isolation)
- `README.md`
- `docs/enrollment-cor-analysis-fixes.md`
- `docs/analysis-college-corrections.md`
- `docs/subject-curriculum-enrollment.md` (this report)
