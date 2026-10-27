# COR acceptance completes enrollment

Updated 24 October 2026, Asia/Manila. This is the current workflow and supersedes the earlier deferred COR-acceptance behavior.

## Root causes

The academic COR path recorded `teacher_status=accepted` without creating class membership. It continued to wait for a separate academic reviewer, even though the assigned class teacher had already accepted the student's document. The unassigned-profile branch in the student form also enabled COR upload before inspecting the entered code and selected year/semester. Saving the academic COR and routing it to a class were separate transactions.

## Final workflow

1. In Join Class, select department, year and semester, then verify the class code. The class must have an active official curriculum assignment matching all three values. A mismatch displays the required/selected information and disables both the COR picker and submission. Changing a selection immediately recomputes the gate; previously selected files remain preserved.
2. For an initially unassigned student, the backend repeats the class/declaration/curriculum checks before validating COR bytes or saving a class-related academic request. A valid COR and its selected-teacher reference save in one transaction. The same checks apply when attaching a COR to an existing pending academic request.
3. The assigned teacher reviews the COR and selects **Accept COR and Enroll** or **Reject Request**. Acceptance is the documentary verification of the matching academic declaration and the class decision. It records the teacher as the reviewer, fills matching initial department/year/section records, creates an accepted class request, creates membership, updates the class count, and sends the existing enrollment-approved notification in one transaction.
4. Acceptance cannot replace a conflicting official department or year, use a changed academic snapshot, admit a student to a closed/unmapped/inactive class, or accept a changed subject/semester. Those failures roll back academic changes and enrollment together. COR acceptance grants no global academic reviewer or curriculum permission.
5. The student sees the class and **Officially enrolled**, with activity access. The enrolled-class list refreshes every five seconds and on focus/reconnect; clicking the enrollment notification also refreshes it. Rejected submissions preserve the COR and separate academic-verification request.

Standalone academic-profile verification remains available through Settings without any class code. The new upload gate applies to class-related COR submissions. Existing official-profile class requests retain their current teacher approval path.

## Existing accepted submission repaired

The saved decision for academic request **72**, intent **1**, already had `teacher_status=accepted`, recorded by the current owner **Mark James Dabalos**. The same validated acceptance helper completed that existing decision for **Marve Cepedoza / SWQ262-HF7 / CP5 - Event-Driven Programming**. It created accepted class request **486** and membership in class **333**, and verified the matching BSIT Year 3 record. No new teacher decision was invented and no global permissions were granted. Metadata from before and after completion is saved under the ignored `.tmp/enrollment-visibility-20261024/cor-acceptance-completion.json`; it contains no COR image bytes.

## Validation

- COR gating integration: **704 HTTP checks passed**, covering all 40 department/year/semester combinations, mismatched declarations rejected before file processing, existing-request COR attachment, atomic routing, initially unassigned records, teacher acceptance, official enrollment and activity access.
- Routing/review integration: **96 HTTP checks passed**, including concurrent approvals, completion of the former accepted-but-not-enrolled state, conflicting official assignments, changed academic snapshots, stale curriculum/semester, rejection, protected COR access, and specific notification destinations.
- Existing curriculum integration: **1,071 HTTP checks passed**.
- Existing enrollment workflow: **51 HTTP checks passed**.
- Frontend flow: **six tests passed**, including all 40 verified and 40 unassigned matching combinations and all 1,560 mismatched unassigned combinations.
- Server-rendered UI checks and both production builds passed. Targeted frontend lint passed with zero errors. Vite retains its existing large-chunk advisory. No connected browser was available for a visual check.

No database schema migration or new dependencies were needed. Existing subjects, curriculum and historical enrollments were preserved. The previously restored BSIT First Semester curriculum is unchanged.

## Files

- `backend/services/AcademicEnrollmentIntent.ts`
- `backend/routes/academics.ts`
- `backend/routes/classes.ts`
- `backend/tests/academic-routing-integration.mjs`
- `backend/tests/cor-gating-integration.mjs`
- `frontend/src/services/classService.ts`
- `frontend/src/services/academicEnrollmentService.ts`
- `frontend/src/utils/enrollmentFlow.ts`
- `frontend/src/screens/student/StudentScreen.tsx`
- `frontend/src/screens/student/components/EligibleSubjects.tsx`
- `frontend/src/screens/student/components/StudentClassCard.tsx`
- `frontend/src/screens/teacher/components/AcademicEnrollmentIntents.tsx`
- `frontend/tests/enrollment-flow.test.ts`
- `frontend/tests/lms-ui.mjs`
