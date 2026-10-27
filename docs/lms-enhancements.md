# TrueSight LMS enhancements — revised integration

> Enrollment and analysis behavior is superseded by [Analysis and college corrections](analysis-college-corrections.md). Rubric grading and export details below remain applicable.

## Integration and behavior

The existing React screens, Express classroom router, PostgreSQL relationships, cookie/JWT authentication, teacher ownership checks, COR approval workflow, and AI detection pipeline remain in use. No dependency was added. Existing uncommitted work in the repository was retained.

Initial analysis of the base application and live database found the following; the first enhancement added rubrics and official grade-level records, and this revision extends those same fields and screens:

- Academic grades already used `submissions.teacher_score`, `teacher_grade`, comments, remarks, evaluator, and evaluation timestamps. AI probability is a separate integrity result and is never used to calculate academic grades.
- Activities already supported a fixed maximum, attachments, due dates, submission types, and resubmission. There was no rubric, draft-grade/publication state, or numeric grade conversion policy. Existing free-text teacher ratings remain supported; a percentage is calculated from the approved score and maximum.
- Enrollment already used a class code, a COR document, a pending request, and teacher approval. Teacher ownership is the existing management boundary. There is no administrator role, subject table separate from classes, or school-year/semester/section enrollment restriction in this schema.
- No authoritative student grade level, section, or subject grade level existed. These are added to the existing user/class records. They are not inferred from class names, student input, or uploaded COR contents.

### Teacher workflow

1. Create a class using the existing dialog, selecting its official department and year level. In **Class Manager → Subject enrollment**, the owning teacher can assign/update that label and open or close new enrollment.
2. Create an activity in Class Manager. **Rubric and Grading Criteria** is an editable table with five blank rows, direct cell editing, criterion descriptions, point limits, per-criterion assistance, and discreet removal/reordering controls. Completing the last row supplies another blank row. Tab uses native keyboard navigation, and Enter advances from name/points cells. Unused rows are ignored. With active criteria, the maximum is their sum; otherwise, the existing Points field applies.
3. Existing activities have an **Edit rubric** disclosure in Class Manager. The server locks changes once any grade or grade history exists, including after a graded submission is resubmitted or withdrawn. New activity creation is the way to change a rubric after grading.
4. Configure the compact **AI-Assisted Scoring Settings** section beneath the table. Choose assisted suggestions or teacher-only grading, enable individual criteria, and optionally enter teacher guidance and measurable requirements. Review and approval are always required; there is no automatic grade-publication option.
5. Run the existing Analyze action. Single and batch analysis automatically save provisional rubric assessments after the unchanged detectors complete. Existing saved analyses can also be assessed with **Generate suggestions from saved analysis**. No model is replaced, retrained, or sent to an external provider.
6. In the existing submission review screen, compare **Criterion / Maximum / AI Suggestion / Teacher's Final Score**. Suggested values prefill ungraded supported criteria. Accept/restore available suggestions, directly edit criterion scores, and enter the unsupported criteria yourself. Incomplete suggestions show an explicit partial subtotal, with no complete AI total or percentage. An incomplete teacher table cannot be approved.
7. Optionally adjust the final total, free-text rating, feedback, or note. **Approve and publish official grade** explicitly confirms the official result. Existing total overrides persist when criterion scores are recalculated. **Restore computed grade**, followed by approval, returns the total to the teacher criterion sum. Restoring available suggestions changes supported teacher cells without erasing human-only scores or original suggestions.

The existing `teacher_score` remains the authoritative final score, `computed_score` is the teacher criterion sum, and `teacher_grade` preserves the existing free-text rating policy. Provisional AI assistance is stored separately in `ai_assessment`; generating or regenerating it never writes those grade fields or approval metadata. New submissions begin unapproved. AI-enabled activity evaluations require `approve: true` on the server; explicit `approve: false` never publishes. Existing teacher-only evaluation clients retain their implicit save-and-publish behavior for compatibility. The UI always sends explicit approval. There is no new draft-grading system.

### What automatic assistance can and cannot assess

The installed DeBERTa, CodeT5-BiLSTM, and EfficientNetV2L models classify likely AI authorship. They are not academic-quality graders. The compatible assessment implementation is a **local, deterministic objective-check evaluator**, integrated into `LmsGrading.ts`, rather than a new semantic AI model or provider.

For essay and document content, teachers can configure a minimum word count, a minimum number of paragraphs separated by blank lines, and required phrases. Each configured check earns an equal share of that criterion's points when met. Explanations report the actual observations and pass/fail evidence. Phrase checks normalize Unicode/case and respect word boundaries. Full saved essay text or the existing PDF/DOCX/TXT extractor supplies the content. Existing analysis completion and detector/submission/version references are retained. Detection probability, label, and confidence are never grading inputs.

Free-text guidance is retained for teacher review; the evaluator does not pretend to interpret arbitrary instructions. Content correctness, quality, coherence, clarity, source attribution, and originality without suitable explicit measurable standards are **Requires Teacher Evaluation**. Phrase presence does not prove correctness or originality. Code/image academic grading, unreadable files, unavailable analysis, disabled criteria, and criteria without checks remain unscored. No academic confidence is fabricated. Suggested totals/percentages exist only when every active criterion has a supported score; otherwise, only a clearly labeled partial subtotal is shown. Teachers may always complete the rubric manually and approve it.

Reanalysis changes only detection results and provisional assessments. Approved teacher criterion scores, ratings, feedback, overrides, and approval status remain unchanged. Grade-history snapshots preserve the assessment available at the time of approval as well as the teacher result. Asynchronous analysis/assessment writes also check the submission version and rubric/settings so stale results cannot be attached to a newer submission or changed rubric.

### Student workflow

The existing Home enrollment panel displays the authenticated student's official grade level/section and eligible open subjects, with a search field. A required grade-level selector asks the student to explicitly confirm their current level; its options come from real student/class grade labels, without a hardcoded grade range. Selecting a subject fills the existing class-code control. Code verification, COR upload, request submission, and teacher review continue as before. The verified class display includes its assigned grade level.

Class-code lookup accepts a code alone and returns public subject metadata, the caller's own request/enrollment status, and an eligibility explanation. Request submission and acceptance require matching selected, official, and class department/year identifiers. A missing official assignment permits lookup and a pending academic verification request; designated staff approval updates the official profile. Existing memberships remain accessible after academic information changes. See the current correction report for reviewer setup and migration details.

The activity details screen adds an Activity Rating Report with the student's identity, grade/section, subject, activity, teacher, submission date, approved criterion breakdown, rubric sum, approved final score, percentage, teacher rating, feedback, and status. The report requires an approved, evaluated numeric score. Pending/unpublished scores are hidden in both student activity-detail and activity-list responses, and exports reject them. Student responses contain only public criterion names/descriptions/maxima and approved earned values: AI suggestions, private guidance, and assessment configuration are not exposed.

**Export Rating / PDF** opens a clean print view; choose **Save as PDF** in the browser print dialog. **Export CSV** downloads a CSV. Both fetch current records again rather than trusting page values or offline cache. The server derives the student ID from the authenticated session and returns only that student's enrolled, graded activity. Query-string student IDs/names/scores have no effect. Print markup escapes text; CSV cells protect against spreadsheet formula injection. Print styles repeat table headers, wrap long descriptions, and allow long rows to flow across pages.

## Database changes and preservation

The existing lazy classroom schema initializer runs an additive, idempotent LMS migration:

| Record | Added fields / relationships |
| --- | --- |
| `users` | Nullable `grade_level VARCHAR(80)` and `section VARCHAR(120)` |
| `classes` | Nullable `grade_level VARCHAR(80)` and `enrollment_open BOOLEAN DEFAULT TRUE` |
| `activities` | `rubric JSONB DEFAULT '[]'`, an ordered list with optional per-criterion assistance/guidance/requirements; `ai_scoring_enabled BOOLEAN DEFAULT FALSE` |
| `class_enrollment_requests` | Nullable `declared_grade_level VARCHAR(80)` for student confirmation |
| `submissions` | `rubric_scores JSONB DEFAULT '{}'`, nullable `computed_score`, `score_overridden BOOLEAN DEFAULT FALSE`, nullable `adjustment_note`; nullable `ai_assessment JSONB` and `grade_approved BOOLEAN` |
| `submission_grade_history` | Previous/saved grade snapshots, submission/activity/student IDs, actor, timestamp; update trigger includes approval and assessment snapshots alongside existing grades |

No existing score is overwritten or regraded, and no submission, activity, enrollment, user, or class is deleted by the migration. Grade levels are not inferred or automatically assigned. Old activities default to an empty rubric and use the existing manual grading flow. Old numeric grades remain authoritative. Historical enrollments remain accessible even after a student's grade changes. Audit rows deliberately retain their IDs without cascading foreign keys so withdrawal/deletion of a submission cannot erase its grade-change history; access is through authorized database operations, with no student-facing history endpoint.

When the approval column is introduced, existing records receive `TRUE` for compatibility with the original published-grade workflow; the default is then set to `FALSE` for new submissions. Existing ungraded records still have no official score because visibility also requires an evaluation timestamp and numeric grade. The migration never changes any historical score. Resubmission retains the original workflow's grade reset and additionally clears provisional assessment/approval; the previous result remains in grade history.

Grade writes lock the activity and submission in a transaction. Rubric edits use the same activity lock. Resubmissions also lock the activity, clear current grading according to the existing resubmission behavior, and retain prior grades in the audit table. The teacher page sends the reviewed submission version, so a newer student submission produces a conflict response requiring a reload. New enrollment requests and approvals validate official grade levels under transaction locks. Approval rechecks eligibility in case the official assignment or class settings changed after the request was filed. Rejections still work for ineligible pending requests.

The new JSON fields are attached directly to the existing activity/submission records; there are no duplicate grading or enrollment tables. Rubric edits, grade writes, and class configuration require the owning teacher. Unassigned or closed offerings fail closed for new enrollment.

API additions remain under the existing `/api/classes` router:

- Join lookup requires only `code`. Join submission requires `departmentCode`, numeric `yearLevel`, and the existing code/COR fields. Acceptance revalidates those saved declarations against the official and class records.
- Activity creation and rubric editing accept `aiScoringEnabled` plus optional criterion `aiEnabled`, `guidance`, and `assessment` settings. Server validation ignores unused rows and rejects invalid active criteria and requirements.
- `POST /submissions/:submissionId/assessment` retrieves the owning teacher's stored content/analysis and generates provisional suggestions. Student-supplied scores, identities, or assessment objects are not inputs.
- The existing evaluation endpoint accepts `approve: true`, `rubricScores`, and the existing override/feedback fields. Enabled activities require explicit approval; scores are always recalculated/validated on the server. `submittedVersion` protects against stale reviews.

## Required setup

1. Build/restart the backend and open the teacher classroom dashboard once to run the existing schema initializer. The migration has also been exercised against the local PostgreSQL database during integration testing.
2. A database operator designates individual staff reviewers with `node manage-academics.mjs grant-reviewer TEACHER_ID`. No teacher receives that permission automatically. Students request verification in the existing enrollment/settings UI; designated staff review requests on the teacher home screen. Operators can also assign a verified official record using `node manage-academics.mjs assign-student STUDENT_ID BSIT 2 "Rizal"`. The former free-text grade assignment utility is retired.
3. Owning teachers configure each class's department and year level in Class Manager. Until both student and class assignments exist, enrollment is blocked with an explanation while code verification remains available. Existing memberships, submissions, and grades remain intact.

## Files added or modified for this enhancement

This is the cumulative file list for the original enhancement and this revision. The existing operator utility, class settings, and export utilities remain in use. This revision adds the scoring-table component and assessment unit tests, extends the original grading/enrollment services and tests, and removes the dedicated segment-heatmap component.

| File | Purpose |
| --- | --- |
| `backend/services/LmsGrading.ts` | Additive schema/audit migration; blank-row/configuration validation; local objective assessment; public rubric projection; three-way eligibility checks |
| `backend/routes/lms.ts` | Settings, assessment from saved analysis, explicit grade approval, private student reports, and real grade-level labels |
| `backend/routes/classes.ts` | Single/batch analysis assessment integration, stale-result guards, declaration capture/revalidation, approval-aware student projections |
| `backend/manage-academics.mjs` | Validated college assignment and designated reviewer bootstrap; the old grade utility is retired |
| `backend/tests/lms-integration.mjs` | Real PostgreSQL/API regression suite and grading/eligibility boundary tests |
| `backend/tests/rubric-assessment.test.ts` | Objective scoring, missing evidence, incomplete totals, unsupported criteria, Unicode/word boundaries, and independence from detector probabilities |
| `backend/tests/integration.mjs` | Real detector → provisional assessment → explicit approval → reanalysis tests, alongside existing regressions |
| `backend/tests/document-access.mjs` | Supply official assignments and declarations to document-access fixtures |
| `backend/tests/browser-preview.mjs` | Update optional browser checks for retained occlusion evidence and removed redundant visualization; not executed without a browser |
| `frontend/src/services/classService.ts` | Additive rubric/grade/class types, mappings, creation and evaluation payloads |
| `frontend/src/services/lmsService.ts` | Fresh authenticated eligibility/settings/rating requests and shared types |
| `frontend/src/screens/teacher/TeacherScreen.tsx` | Department/year in existing class creation; rubric creation payload; refresh after edits |
| `frontend/src/screens/teacher/components/TeacherClassManagerModal.tsx` | Integrate rubric creation/editing and class enrollment settings |
| `frontend/src/screens/teacher/components/RubricBuilder.tsx` | Spreadsheet-style rubric editing, five initial blank rows, automatic trailing row, inline AI settings/checks |
| `frontend/src/screens/teacher/components/RubricScoringTable.tsx` | Suggestion/evidence and editable final-score table, partial totals, accept/restore controls |
| `frontend/src/screens/teacher/components/ClassEnrollmentSettings.tsx` | Grade-level/open-enrollment settings for the owning teacher |
| `frontend/src/screens/teacher/SubmissionDetailPage.tsx` | Suggestion loading/generation, teacher scores, explicit approval, live totals and overrides |
| `frontend/src/screens/teacher/components/TextEvidencePanel.tsx` | Retain sentence occlusion and remove redundant heatmap rendering |
| `frontend/src/screens/teacher/components/SubmissionReviewWorkspace.tsx` | Label the remaining analysis tab as evidence |
| `frontend/src/screens/teacher/components/SegmentHeatmap.tsx` | Removed unused component and its dedicated controls/legend/tooltips |
| `frontend/src/utils/analysisPresentation.ts` | Remove unused segment-color presentation helper; preserve shared parsing and summaries |
| `frontend/src/index.css` | Remove only dedicated segment heatmap layout selectors; shared heatmap/occlusion styles remain |
| `frontend/src/screens/student/StudentScreen.tsx` | Declared-grade state and protected lookup/request payloads within the existing enrollment panel |
| `frontend/src/screens/student/components/EligibleSubjects.tsx` | Official profile, real grade selector, mismatch feedback, eligible-subject search/selection |
| `frontend/src/screens/student/StudentActivityDetailsPage.tsx` | Integrate student report and percentage fallback |
| `frontend/src/screens/student/components/ActivityRating.tsx` | Authenticated report display and export buttons |
| `frontend/src/utils/ratingExport.ts` | Escaped print/PDF layout, safe CSV and fresh export retrieval |
| `frontend/tests/lms-ui.mjs` | Rendered controls, totals, report serialization, escaping and long-rubric checks |
| `frontend/tests/detection-ui.test.tsx` | Assert redundant heatmap absence with retained data, verdict, and sentence occlusion |
| `docs/lms-enhancements.md` | Architecture findings, integration, setup, affected files and verification |
| `README.md` | Link to enhancement setup and enrollment assignment requirements |

The unused legacy `CreateClass.tsx` mock screen was not rewritten; active class creation is the existing TeacherScreen dialog.

## Verification

Run from `backend`:

```powershell
npm.cmd run build
node tests/lms-integration.mjs
node tests/document-access.mjs
.\node_modules\.bin\tsx.cmd --test tests/detection.test.ts tests/rubric-assessment.test.ts
node tests/integration.mjs
```

Run from `frontend`:

```powershell
npm.cmd run build
node tests/lms-ui.mjs
..\backend\node_modules\.bin\tsx.cmd --test tests/detection-ui.test.tsx tests/theme-contrast.test.ts
npm.cmd run lint
```

The LMS API suite creates isolated temporary users/classes/submissions in the configured PostgreSQL database and removes its fixtures afterward; it does not substitute database mocks or start detector models. The existing full integration test uses the real local detectors.

Verified results:

- Backend TypeScript compilation and frontend production build: passed. Vite retains its existing large-chunk warning.
- LMS suite: passed 96 HTTP assertions plus validation/grade-matching assertions, including concurrent grading/resubmission, declaration requirements and mismatches, explicit approval, missing analysis, unsupported evidence, private configuration, unpublished grade filtering on every student grade route, student isolation, and unchanged original rubric/override/enrollment workflows.
- Existing document-access integration suite: passed for COR ownership, unrelated accounts, rejected requests, and enrollment preservation.
- Existing detector unit suite: 4 tests passed; new assessment unit suite: 6 tests passed.
- Existing frontend detection/theme suite: 11 tests passed.
- Rendered-component/report suite: passed editable rubric tables, five initial rows, automatic trailing row, assistance settings, suggestion/final grading table, incomplete subtotal/unscored messaging, existing enrollment settings and report serialization/security checks.
- Full integration with real DeBERTa, CodeT5-BiLSTM, and EfficientNetV2L: passed the existing regressions plus automatic evidence-backed partial rubric suggestions after real analysis, unsupported originality/quality criteria, no provisional-grade publication or student AI disclosure, explicit teacher approval, and preservation of approved scores during batch reanalysis. Its optional browser check was not enabled.
- Lint for the files changed by this enhancement: no errors; the existing `openClassManager` effect-dependency warning remains. Full frontend lint is blocked by existing `react-refresh/only-export-components` errors in untouched `components/ui/form.tsx`, `context/GoogleAuthProvider.tsx`, and `theme/ThemeContext.tsx`.
- `git diff --check`: passed.

Remaining limits and setup:

- No browser/native UI surface was connected to this session. Live click-through, mobile visual inspection, and the browser Save as PDF dialog were not verified. Component rendering and report markup/serialization were verified; PDF pagination should still receive a browser print-preview check before deployment.
- PDF export uses the browser print workflow; there is no added server PDF engine or one-click PDF file generator. CSV downloads directly.
- Student official assignments and class grade levels must be configured before new enrollment can proceed. No student is assigned a grade automatically.
- Semantic academic-quality, correctness, clarity, originality, code, and image grading remain teacher tasks. The available automatic capability consists of transparent teacher-configured objective checks, not a semantic generative grading model. Adding a different assessment provider/model would require a separately approved integration; no student work is transmitted to a new service.
- The app has no administrator UI, school-year/semester enrollment model, or promotion workflow. Those were not invented. Approval is added to the existing grade record, without a separate draft-grading subsystem.
