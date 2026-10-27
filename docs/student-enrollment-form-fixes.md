# Student enrollment form consolidation

Updated 24 October 2026, Asia/Manila.

**Current workflow:** [COR acceptance completes enrollment](cor-acceptance-enrollment.md) adds a strict class/declaration/semester gate before the Join Class uploader, including for unassigned profiles. Standalone verification remains in Settings.

Follow-up: [Teacher enrollment submission visibility](teacher-enrollment-visibility.md) adds explicit routing of academic COR submissions to the selected class teacher. These appear separately from class approval requests, without bypassing official verification.

## Root causes

Join Class embedded an independent `AcademicVerificationPanel` above its own confirmation fields and COR uploader. The two forms owned separate state, so selecting department/year/section in the upper form did not populate the class form. Official academic information, confirmation fields and COR controls appeared twice.

The screenshot also showed an unassigned official department/year. The lower uploader required class eligibility and therefore remained disabled even after a declaration was entered. Self-entered values cannot replace staff-verified records, so simply removing that gate would have bypassed the official subject restrictions. The student had no semester selector even though classes and curriculum already stored semesters.

## Final behavior

- Join Class has one official-profile summary, one department/year confirmation pair, one semester selector, one section field and one COR uploader. The embedded upper verification/COR form was removed. Full profile correction remains available under Settings through **Academic profile settings**.
- First/Second Semester filters the available subjects and open classes. The selected semester is saved in the private user-scoped enrollment draft; older drafts default to First Semester while retaining their fields and COR.
- One shared flow decision controls the uploader and the submission action, with a visible reason whenever upload is disabled.
- If official department/year is missing, valid confirmation fields enable the single lower uploader for **academic-profile verification only**. The primary action is **Request academic verification**, or **Save supporting COR** if attaching to the student's existing matching pending request. No class enrollment request, teacher class-approval request or membership is created by these actions.
- An already saved academic COR remains protected and can be viewed through the authorized viewer. The form shows **Academic verification pending** and prevents replacement/duplicate submission while it awaits staff review.
- Once official academics and a current class code match the selected department, year and semester, the same lower uploader supports **Submit Enrollment Request**. Existing COR validation and assigned-teacher review remain required. Saved local CORs are retained as the student changes stages or codes.
- Verified students requesting an ineligible/closed/unmapped class still cannot submit a class COR request. Existing memberships and pending requests block duplicate submission. Settings remains the path for correcting an already assigned official record.
- Student catalog responses now include only that authenticated student's academic-verification metadata, never COR image bytes or other students' requests. The shared catalog refreshes after submission, on focus and by polling.

## Related bugs fixed

1. A selected semester was previously a display/filter detail during student submission. `prepareEnrollment` now validates an optional submitted semester against the actual class before file processing/request creation. Wrong-semester API calls receive a structured `SEMESTER_MISMATCH` denial. Legacy API clients omitting this confirmation still use the authoritative class semester.
2. A successful class request followed by a failed lookup could previously be reported as a failed submission. Successful save now immediately updates the local pending state using the saved response; follow-up refreshes run independently.
3. Old lookup failures could clear a newer lookup. Lookup success, error and completion now check the current form generation. Saves also invalidate lookups started before the commit.
4. Catalog refreshes are sequenced and guarded against unmounts so older responses cannot overwrite newer official/request state.
5. File selection now clears the native file-input value after reading the File, allowing the same filename to be selected again after an invalid attempt. Invalid replacements retain the previous valid COR. Removing a selected COR is disabled while upload preparation/submission is running.
6. Rapid local draft writes are serialized per authenticated user to prevent an older field/semester snapshot from overwriting a later edit. Changes do not erase the stored COR.
7. Unassigned official records now produce a verification-stage explanation rather than the misleading claim that the department/year has no configured curriculum.

## Validation

- Six enrollment-flow unit tests passed, covering the screenshot's unassigned record, independent COR verification, pending attachment matching, protected saved CORs, incomplete/loading states, current code, department/year/semester mismatch, closed/unmapped classes, duplicates, compatible section review, and all 40 valid department/year/semester combinations.
- Server-rendered UI checks confirm one official summary, one department/year selector pair, no embedded upper COR/verification form, and semester-filtered subjects. Existing LMS UI checks continue to pass.
- Semester integration: 435 HTTP checks passed, including 40 manipulated semester confirmations rejected before class request creation and valid COR/teacher approval in both semesters.
- Curriculum integration: 1,071 HTTP checks passed, including that the enrollment catalog exposes only the caller's verification metadata, preserves private COR access, and reflects the staff-approved official record.
- Existing enrollment workflow: 51 HTTP checks passed. Grading/report/history regression: 96 HTTP checks passed.
- Backend and frontend production builds passed; targeted lint on all modified frontend logic passed with zero errors. Vite retains its existing large-chunk advisory.
- No database migration or curriculum changes were needed for this UI consolidation. A final database read confirmed that the recovered BSIT First Semester counts remain 10 / 9 / 4 / 8 (31 total).

Browser visual verification and a real browser reload of the IndexedDB draft remain manual checks. No automated claim of browser interaction is made.

## Files

- `frontend/src/screens/student/StudentScreen.tsx`
- `frontend/src/screens/student/components/EligibleSubjects.tsx`
- `frontend/src/hooks/useEnrollmentCatalog.ts`
- `frontend/src/utils/enrollmentFlow.ts`
- `frontend/src/utils/enrollmentDraft.ts`
- `frontend/src/services/classService.ts`
- `backend/routes/lms.ts`
- `backend/services/EnrollmentWorkflow.ts`
- `frontend/tests/enrollment-flow.test.ts`
- `frontend/tests/lms-ui.mjs`
- `backend/tests/semester-integration.mjs`
- `backend/tests/curriculum-integration.mjs`
