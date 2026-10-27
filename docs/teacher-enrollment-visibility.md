# Teacher enrollment submission visibility

Updated 24 October 2026, Asia/Manila.

**Current workflow:** [COR acceptance completes enrollment](cor-acceptance-enrollment.md) supersedes the deferred acceptance stage described below. Assigned-teacher acceptance now verifies the matching initial academic declaration and enrolls the student atomically.

## Cause

The latest student submission was an academic-profile verification request, not a class enrollment request. The student's official department and year were unassigned. The consolidated Join Class form correctly saved the COR for independent academic verification, but discarded the selected class code when saving that request. The class teacher therefore had neither a class approval request nor a reference to the academic COR. The existing class-request query already includes pending and processed requests for their assigned teacher.

## Change

- The student form saves the academic COR independently, then routes it to the teacher selected by class code. A routing failure preserves the COR and reports the separate failure. A **Send saved COR to class teacher** action supports already saved pending submissions without reuploading.
- Routing checks the authenticated request owner, pending status, saved COR, open class, declared department/year, actual semester and active official curriculum mapping. These declarations route documentary evidence only; they never replace official academic records or grant class access.
- Teacher **Enrollment Requests** includes **COR Enrollment Requests**, with an inline protected COR preview above the student's declared/official information, subject/class/semester, review note and review controls. Only the selected class owner sees this section. The submission produces an internal notification and a persistent student receipt naming the recipient.
- Teachers can **Accept COR** or **Reject Request**. Acceptance before official verification records the documentary decision without creating a class approval request or membership. Rejection affects that class submission and preserves independent academic verification and the original document.
- Once official department/year/section and the active subject/semester mapping match, **Approve Enrollment** creates the accepted class request and membership atomically, using the saved COR. The student need not upload again. The original student-submitted class request path still works; it replaces the earlier entry in the teacher display. Accepted requests remain visible.
- Ordinary class teachers cannot assign official academic records without the existing designated reviewer permission. Final approval rechecks official records, the class owner, class/subject/semester snapshots, curriculum and the COR. It does not use unverified declarations to grant access.
- Enrollment notifications are clickable with mouse or keyboard even without an activity ID. Their links select the specific academic COR card or open the class-request COR viewer. Earlier COR notifications resolve to a later class request after either direct teacher approval or a separate student submission. Submission/activity notifications retain their existing destinations, and student enrollment-review notifications open the student enrollment page.
- The teacher list refreshes every 15 seconds, on focus, on reconnect and manually. Failed polling retains the last successful list, and older responses cannot overwrite newer loads.

## Database and existing submission

The idempotent college schema initialization adds `academic_enrollment_intents`, referencing the existing academic request, class and subject, with a semester snapshot and unique `(academic_request_id, class_id)` constraint. Routing and notification creation share a transaction. Resending does not duplicate the entry or notification. Existing subjects, curriculum, enrollments and COR files are preserved.

The review follow-up adds `teacher_status` (pending/accepted/rejected), `review_note`, `reviewed_by`, `reviewed_at` and `enrollment_request_id` through idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Existing rows default to pending. Class approvals serialize class updates and lock the student/request records to prevent duplicate admission or incorrect student counts. No real student request was automatically accepted or rejected.

The existing pending academic request **72**, for **Marve Cepedoza**, was linked to **SWQ262-HF7 / CP5 - Event-Driven Programming / First Semester**, owned by **Mark James Dabalos**, using the same validated helper. No academic profile was changed and no class membership or class approval request was created. Other pending academic requests were left untouched because their intended class was unknown.

## Validation

- Routing and review integration: **89 HTTP checks passed**, covering scoped Accept/Reject, COR privacy, deferred verification, invalid code/department/semester rejection, stale curriculum and wrong official department denial, atomic final approval, concurrent same-student and different-student approvals, notification destinations, student receipts, reviewer permission enforcement, subsequent real class submission and processed-request visibility.
- Existing enrollment workflow: **51 HTTP checks passed**.
- Existing curriculum integration: **1,071 HTTP checks passed**, including all 20 department/year combinations, 380 mismatches, stale approval protection, historical access and independent academic COR privacy.
- Server-rendered UI checks passed, including COR before student information, active documentary review controls, final approval only for an eligible verified record, rejected-state controls, and keyboard-focusable enrollment notifications without activity IDs. Destination tests cover specific academic/class requests, student reviews, teacher submissions and student activities.
- Backend and frontend production builds passed. Targeted frontend lint had zero errors and one existing `openClassManager` effect dependency warning. Vite retains its existing large-chunk advisory.

No real account was granted academic verification privileges. School personnel must designate an academic reviewer through the existing permission administration before the pending official academic record can be approved. No connected browser was available; browser visual verification remains a manual check.

## Files

- `backend/services/CollegeEnrollment.ts`
- `backend/services/AcademicEnrollmentIntent.ts`
- `backend/routes/academics.ts`
- `backend/routes/classes.ts`
- `backend/routes/lms.ts`
- `backend/tests/academic-routing-integration.mjs`
- `frontend/src/services/academicEnrollmentService.ts`
- `frontend/src/services/classService.ts`
- `frontend/src/utils/notificationTarget.ts`
- `frontend/src/components/ActivityNotificationsPopover.tsx`
- `frontend/src/screens/student/StudentScreen.tsx`
- `frontend/src/utils/enrollmentFlow.ts`
- `frontend/src/screens/teacher/TeacherScreen.tsx`
- `frontend/src/screens/teacher/components/TeacherUploadsSection.tsx`
- `frontend/src/screens/teacher/components/AcademicEnrollmentIntents.tsx`
- `frontend/tests/lms-ui.mjs`
