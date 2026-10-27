# Enrollment, COR, and analysis presentation fixes

> Enrollment policy update, 24 October 2026: [Official subject curriculum and enrollment validation](subject-curriculum-enrollment.md) supersedes the permissive class-request workflow below. Official department/year and an active curriculum mapping are now required before class COR submission. Independent academic-profile COR verification remains available. The analysis and grading findings below remain applicable.

Updated 23 October 2026 (Asia/Manila). This report supersedes the enrollment gating and primary result labels in `analysis-college-corrections.md`; prior measured model scores and grading behavior remain applicable.

## Enrollment root cause

The earlier college integration enforced final admission eligibility too early. The student COR uploader and submit button were inside `joinLookup.eligible`, while `POST /join` called final eligibility validation before saving the enrollment request. A student without official academics could verify a code and submit a separate academic request, but could not upload a COR or create the class-specific request that the assigned teacher's queue reads. The generic “Uploads” navigation label also obscured the existing approval interface. Teacher notifications were limited to new submissions, and no enrollment event was generated.

The class-to-teacher query and existing pending/accepted/rejected storage were correct. The fix connects request creation and visibility while preserving the stricter checks for final class membership.

## Connected workflow

1. Students select a canonical department/year, enter their section if assigned, and select a COR. These controls stay available before code verification and while official academics are missing. Checking/changing the code or selection does not clear a valid COR.
2. Code verification retrieves the public class metadata and the caller's own request/membership status. It sends no approval request or notification.
3. Deliberate submission validates the declaration, target class, upload, and duplicate guards. A valid request persists department, year, section, COR bytes/metadata, student, class, timestamps, and the class's teacher relationship.
4. When official department/year are missing, or a supplied section needs confirmation, the same transaction creates or links a matching pending academic request. It never writes the declared values into the official user profile. An existing conflicting academic request must be resolved first; it is not overwritten.
5. The assigned teacher immediately sees the enrollment request. Its derived stage is **Pending Academic Verification** until required official information matches, then **Pending Teacher Approval**. These labels map onto the existing `pending` database state; `accepted` displays as **Enrolled**, and `rejected` as **Rejected**.
6. Individually designated academic staff use the existing protected review queue, now with linked class/COR context, to approve or reject the official record request. The class teacher cannot perform academic verification without that specific permission.
7. Final class admission still requires matching declared, official, and class department/year, any declared section confirmation, an open class, a valid COR, the owning teacher, and a pending unprocessed request. Only successful final approval inserts membership. Rejection preserves the COR and saves the teacher's reason.

A fully assigned student cannot bypass their official department/year by declaring the class's values. Wrong declarations and wrong-department/year requests are rejected; the existing academic correction workflow remains available. A valid COR alone never overrides official academics. No new semester, capacity, cross-department, or class-section policy was invented where none existed.

## COR preservation and privacy

- The existing supported COR types remain PNG, JPEG/JPG, and WEBP. Server checks now validate base64 image data, actual decoded format, MIME agreement, decoded size, and safe filename handling. Actual byte length is stored instead of trusting the client's size. Existing overall request/data-URL limits remain in force.
- Upload progress, selected filename, replacement before submission, original download, and authorized preview remain available. An invalid replacement does not discard the previous valid selection.
- A private IndexedDB draft is keyed by authenticated user ID and stores the form fields and selected file. The form restores that draft after reload and retains it when a request becomes pending. Storage failures produce a visible message. This is browser-local storage, not encrypted archival storage or a public upload URL; shared-device users should clear their browser data when appropriate.
- Submitted COR data remains in the existing private database column and is associated with its original request. No original COR files or records were deleted or migrated into public storage.
- Queue responses carry file metadata and a presence flag, not COR bytes. The viewer fetches the protected document endpoint. The student owner and assigned class teacher can read their COR. Designated academic staff may read a COR linked to their academic review queue. Ordinary unrelated teachers/students are denied.
- Draft restoration across a real browser refresh still needs manual verification in the target browser. No browser/app surface was exposed by the UI automation inventory in this session. This limitation is distinct from submitted COR persistence, which was validated through the real database and HTTP endpoints.

## Teacher and student interfaces

The existing teacher Uploads route is retained and labelled **Enrollment Requests**, with the heading **Student Enrollment Requests**. A home-screen pending count and review button make it discoverable. The queue includes pending and processed records, declared academics, official information in the review panel, eligibility explanations, COR preview/download, approve/reject controls, and rejection notes. Approval is disabled in the interface while required verification is unresolved, and the backend independently enforces that restriction. The queue refreshes with notifications every 15 seconds and can be refreshed manually.

Persisted enrollment-request notifications reach the assigned teacher through the existing notification system and open the review queue. Approval/rejection notifications reach the student, including a rejection reason when supplied. Notification insertion and request/review changes share a transaction; a failed operation does not claim to have created a request.

Students track the saved request's derived verification stage, declaration, section, COR presence, and review result. Pending status does not unlock activities. Form values remain intact after successful submission, and submitted CORs remain accessible from request history after refresh or rejection.

## Analysis root cause and interpretation

The supplied screenshot shows the reproduced SE_ME result: approximately 99.09% AI and 0.91% human, with the previous technical uncertainty label and a “Very High” confidence card. The probabilities were not reversed: the trained text mapping is **logit index 0 = HUMAN, index 1 = AI**, transformed once with softmax. The validated text decision remains **AI when unrounded pAI >= 0.9913054109**. Thus the observed SE_ME score of 0.9908859729766846 returns raw HUMAN. Calling that a confident human-authorship finding is misleading, and the technical threshold headline did not resolve the presentation problem for ordinary users.

The backend now supplies a plain-language presentation from the same validated run:

| Verified model result | Primary label |
| --- | --- |
| Raw AI decision under the configured rule | Possibly AI-Generated |
| Raw HUMAN decision with a stronger human score | Possibly Human-Created |
| Raw HUMAN decision with AI score at least as large as human score | Inconclusive |

This is a transparent display policy for conflicting indications, not a newly calibrated model or a replacement 50% classification threshold. For example, 90% AI remains below the existing text threshold and is shown as **Inconclusive**, rather than silently changing the validated text rule. A 10% AI text result is **Possibly Human-Created**; a 99.9% AI text result is **Possibly AI-Generated**. Code and image keep their own existing rules.

No probabilities, trained weights, tokenization, or decision thresholds were changed for this fix. Primary percentages are labelled **AI model score** and **Human model score**, because their population calibration has not been established. The primary “Very High confidence” claim is removed. Bars match the actual numeric values, and result colors follow the backend's presentation tone rather than an unrelated percentage cutoff. Thresholds, raw labels, run/model identifiers, and the largest class score remain in advanced technical details.

Read-time projection also updates valid older saved results to the current presentation without editing historical JSON or grades. The frontend displays the returned label and interpretation. Existing full-precision probability validation, run/version identities, stale-fetch guards, and concurrent-analysis leases remain in place.

### Actual supplied-document evidence

The earlier production runs are preserved in `sample-evaluation.json`:

| Author-reported sample | Measured AI score | Measured human score | Raw decision | Current presentation |
| --- | --- | --- | --- | --- |
| SE_AI.docx, generated with GPT | 99.99369383% | 0.00630141% | AI | Possibly AI-Generated |
| SE_ME.docx, written by the user | 99.08859730% | 0.91140179% | HUMAN | Inconclusive |

Both authorships were confirmed by the user, without an independent authorship audit. Those raw decisions agree with the two reported labels, so the two-sample raw binary confusion matrix remains TN=1, FP=0, FN=0, TP=1. This is not proof of 100% general accuracy. The high AI score on the human sample remains an evaluation concern; its Brier/ECE evidence and the missing broader held-out corpus are documented in the earlier report. It has not been hidden by reversing the scores or forcing a human-likely classification. The current presentation deliberately leaves that example inconclusive.

## Explainability and grading compatibility

There is still one **Advanced evidence: sentence occlusion** panel. Its exact analyzed excerpt, UTF-16 sentence offsets, original baseline, masked score, signed percentage-point difference, ranking, legend, and limitations are preserved. There is no separate Content-level indicators heatmap. Evidence continues to be checked against the same baseline/run; invalid or unavailable evidence is not fabricated.

Rubric editing, objective assisted suggestions, teacher-only judgments, overrides, approval, private published grades, PDF print export, CSV export, grade audit history, and existing membership access remain separate from authorship detection. Reanalysis never converts a model score into an academic grade.

## Database and implementation files

The additive college migration adds only `declared_section` and `academic_request_id` to the existing `class_enrollment_requests` table. The latter links the existing academic verification table, with `ON DELETE SET NULL`. Existing request states, memberships, user records, grades, COR bytes, and relationships remain intact. No new authentication role or automatic reviewer grant was introduced.

| Files | Change |
| --- | --- |
| `backend/services/EnrollmentWorkflow.ts` | Request preparation, linked verification, shared status projection, transactional notifications |
| `backend/services/CollegeEnrollment.ts` | Additive request section/link fields |
| `backend/routes/classes.ts` | Persist requests before final verification, private queue projections, approval checks, image validation, notification retrieval, protected COR access |
| `backend/routes/academics.ts` | Linked class/COR context in authorized academic review |
| `frontend/src/screens/student/StudentScreen.tsx` | Always-available COR/section inputs, retained state, draft restore/save, saved tracking stages |
| `frontend/src/utils/enrollmentDraft.ts` | Authenticated-user-scoped IndexedDB draft storage |
| `frontend/src/screens/student/components/EligibleSubjects.tsx` | Keep enrollment selections and place separate official-profile correction behind a disclosure |
| `frontend/src/screens/teacher/TeacherScreen.tsx` | Visible queue entry/count, notification navigation, regular refresh |
| `frontend/src/screens/teacher/components/TeacherUploadsSection.tsx` | Academic/verification information, protected COR viewer, admission eligibility controls, processed requests |
| `frontend/src/screens/teacher/components/AcademicReviewPanel.tsx` | Protected linked-COR review |
| `frontend/src/services/classService.ts` | Canonical request fields, fresh queues, enrollment notification types |
| `backend/services/DetectionResult.ts` | Shared plain-language presentation and uncalibrated-score metadata for new/saved results |
| `frontend/src/screens/teacher/components/AnalysisSummary.tsx`, `MultiLevelAIDetectionPanel.tsx`, `TeacherClassManagerModal.tsx`, `SubmissionDetailPage.tsx` | Consistent primary labels, score wording, bars/colors, and advanced technical information |
| `backend/tests/enrollment-workflow.mjs` and existing test suites | Connected flow, privacy, notifications, eligibility, grading, model contract, and UI regression coverage |

## Verification and setup

Run from `backend` after building:

```powershell
npm.cmd run build
node tests/enrollment-workflow.mjs
node tests/college-integration.mjs
node tests/lms-integration.mjs
node tests/document-access.mjs
node --import tsx --test tests/detection.test.ts tests/prediction-contract.test.ts tests/evaluation-metrics.test.mjs tests/rubric-assessment.test.ts
node tests/integration.mjs
```

From `frontend`, run `npm.cmd run build`, the existing `tests/detection-ui.test.tsx` TSX runner, and `node tests/lms-ui.mjs`. Final results: both production builds passed; 18 backend detection/contract/metrics/rubric tests, 12 Python tests, six rendered detection UI tests, and the extended rubric/queue/selector/export SSR checks passed. The connected enrollment suite passed 49 HTTP checks, the college suite passed 42 HTTP checks plus all 20 catalog combinations and 380 mismatch cases, the existing grading/enrollment suite passed 97 HTTP checks, and the document-access suite passed. The full real-model integration passed text/code/image routing, DOCX/PDF/legacy TXT extraction, database/result agreement, concurrent-analysis conflicts, batch analysis, unchanged grades/history, and worker failure without fabricated scores. The older integration assertion expecting COR bytes directly in a queue row was updated to verify their absence there and their exact preservation at the authorized document endpoint. The added teacher-queue lint issue found during verification was fixed; remaining lint findings are the three pre-existing Fast Refresh errors and the existing TeacherScreen dependency warning. Browser interaction/refresh and print-dialog visual QA remain manual checks because UI automation reported no enabled browsers/apps. Frontend lint's three existing Fast Refresh export errors remain outside this change.

Restart the backend and frontend development server (or rebuild/redeploy the existing application). The existing authenticated classroom initializer runs the additive migration. As before, a database operator must designate specific academic reviewers using `node manage-academics.mjs grant-reviewer TEACHER_ID` from `backend`. No real teacher has been granted that permission by this work; tests use temporary fixture accounts. Existing teachers can immediately see their assigned enrollment requests, even before an academic reviewer is designated, but cannot bypass the required academic approval.

### Live demonstration checklist

1. As a student missing official academics, select BSIT / 2nd Year / section A and a real COR. Verify a matching class code. Confirm that the COR and entered data remain visible; code verification has not sent a request.
2. Submit. Open the assigned teacher's **Enrollment Requests** screen and show the saved record and COR with **Pending Academic Verification**. Show that ordinary unrelated teachers cannot access it.
3. As designated staff, review the linked COR and official information. Approve the academic request. Refresh the class teacher's queue; it now shows **Pending Teacher Approval**.
4. Approve admission, then refresh the student dashboard and show the class membership. Separately reject another request with a reason, then show that reason and original COR in student history.
5. Submit/analyze the two user-confirmed documents. Show the actual unchanged scores, **Possibly AI-Generated** or **Inconclusive**, the plain-language interpretation, and the advanced raw decision/threshold. Select an occlusion passage and verify baseline minus masked score.
6. Review, approve, and export a rubric grade. Reanalyze and confirm that the published grade remains unchanged. Finally verify draft restoration and COR selection after a real browser reload; this part was not manually exercised in the tool environment.
