# Analysis correction and college enrollment integration

> Current enrollment setup and validation: [Official subject curriculum and enrollment validation](subject-curriculum-enrollment.md), 24 October 2026. It requires verified academics and an explicit official curriculum mapping before class COR requests; independent academic-profile COR verification remains available.

> The latest [Enrollment, COR, and analysis fixes](enrollment-cor-analysis-fixes.md) supersede this report's earlier request gates and technical result headline. Raw measurements below are retained as the original evaluation record.

## Reproduced result and root cause

On 23 October 2026, the user supplied `SE_AI.docx` and `SE_ME.docx`, then confirmed that the first was generated with GPT and the second was written by them. They identified `SE_ME` as the contradictory result. This is author-reported provenance, not an independent authorship audit. Original documents were read without modification. Their hashes and measured results are in [sample-evaluation.json](sample-evaluation.json); the report omits their sentence text.

Both documents were processed through the application's Mammoth extractor, existing local inference worker, trained DeBERTa checkpoint, and backend result adapter. No filename-based labels or expected authorship were supplied to inference.

| Sample | Extracted words / characters | Tokens | Raw logits [HUMAN, AI] | AI probability | Human probability | Frozen model decision | Current display |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SE_AI.docx | 203 / 1,796 | 252 | [-4.69799614, 4.97409248] | 99.99369383% | 0.00630141% | AI | AI-likely |
| SE_ME.docx | 204 / 1,123 | 218 | [-2.35339475, 2.33539891] | 99.08859730% | 0.91140179% | HUMAN | Below AI threshold — authorship uncertain |

The production JSON and checkpoint agree: output index 0 is HUMAN and index 1 is AI. One softmax supplies both complementary probabilities; the adapter converts 0–1 values to percentages once. Small floating-point differences in their sum are tolerated, not silently re-normalized.

The saved text rule is **AI when the full-precision AI probability is at least 0.9913054109 (99.13054109%)**. SE_ME falls below it by about 0.04194 percentage points. Thus the model's raw HUMAN decision is consistent with that threshold. The misleading behavior came from presenting a below-threshold decision as an affirmative claim of human-created writing, without explaining why the high AI score did not cross the threshold. No reversed class mapping or double percentage conversion was found in this reproduced path. This reproduction does not establish which software version produced the earlier screenshot or exclude unrelated historical stale results.

The threshold and model weights remain unchanged. Code retains `pAI >= 0.54`; image retains strict `pAI > 0.50`. The formatter now distinguishes AI-likely, Human-likely, and a HUMAN decision with AI probability greater than human probability, displayed as below-threshold uncertainty. This last label is a transparent interpretation of the existing rule, not a newly validated abstention threshold or probability adjustment.

## Authoritative result and synchronization

- `DetectionResult.ts` validates finite bounded complementary scores, the configured detector threshold, and agreement between the raw decision and unrounded score. Invalid results fail instead of receiving fabricated percentages.
- One `analysis_details` object retains the UUID, analysis time, model name, model artifact hash/version, raw label, decision label, rule, threshold, full-precision probabilities, raw outputs, class mapping, transformation, and evidence. Text results also record a tokenizer fingerprint. Code and image artifacts receive their own hash identifiers.
- Image presentation previously replaced canonical AI/HUMAN labels with display strings. `ImageService.ts` now adds image metadata while preserving the canonical contract.
- The existing rounded database scalar column remains for compatibility. Read responses derive probabilities and decisions from the validated full-precision JSON from the same run. This avoids combining a rounded scalar or legacy label with another probability record. No historical JSON or grade is rewritten to repair a display.
- Unverifiable legacy results are marked for reanalysis. Failed runs have null probabilities and an unavailable message. A saved submission/version mismatch is rejected during projection.
- Single and batch analysis use a per-submission request UUID lease plus the existing submission-version and rubric/settings checks. An older overlapping run cannot save after a newer run has acquired the lease. A stale single request returns 409.
- Teacher detail/report pages clear results on route changes and ignore obsolete fetch completions. Detail/report data is fetched fresh without the offline cache, and classroom responses send `Cache-Control: no-store`. Offline reading of other classroom data remains available through its existing paths.
- Grade fields and publication state are independent of detection probabilities. Reanalysis still saves provisional assistance separately and never applies an academic penalty or replaces an approved grade.

## Sentence occlusion

There remains one **Advanced evidence: sentence occlusion** disclosure. The removed Content-level indicators heatmap has not been restored.

The same loaded model masks each eligible passage's tokens in the original tokenized input. It does not regenerate prose, retokenize each passage as a different document, or substitute isolated sentence scores for the document result. The original baseline remains authoritative.

`influence in percentage points = (baseline pAI - masked pAI) × 100`

The evidence includes its baseline. Backend and frontend checks reject inconsistent baselines, non-finite masked scores, fabricated differences, invalid ordering, or offsets that do not match the exact excerpt. JavaScript UTF-16 offsets preserve emoji, repeated sentences, Unicode, punctuation, and paragraph whitespace. Text outside the 512-token context is not represented as assessed; that limit and the first-16-passage evaluation cap are disclosed.

Clicking a highlight or ranked passage shows its exact wording, number, original score, masked score, signed difference, and direction. Ranking uses absolute measured influence and retains negative contributions. The display scale is explicitly a presentation convention:

| Influence | Display |
| --- | --- |
| +10 pp or more | Strong positive, red/orange |
| +5 to less than +10 pp | Moderate positive, orange |
| +0.01 to less than +5 pp | Weak positive, light orange |
| Greater than −0.01 and less than +0.01 pp | Minimal change, neutral |
| −0.01 pp or less | Negative contribution, teal/blue |

The text notice explains that measured model sensitivity does not independently establish authorship or academic misconduct. Effects interact and do not add up to the document score. SE_AI yielded 10 assessed passages and SE_ME 8; neither supplied document exceeded the context limit.

## Evaluation results and limits

The evaluator accepts a manifest with file path, authorship, and provenance. It uses the production extractor and worker, records document/text hashes and model versions, and computes metrics from provided labels. Mixed and unknown authorship are excluded from binary metrics; unavailable predictions are counted separately. Document text is omitted from the saved evaluation artifact.

For **these two user-confirmed DOCX samples only**, the unchanged raw binary decisions yielded:

| Measurement | Observed value |
| --- | --- |
| Samples | 2: one author-reported human, one author-reported GPT-generated |
| Confusion counts | TN 1, FP 0, FN 0, TP 1 |
| Accuracy / precision / recall / F1 | 1.00 each |
| False-positive / false-negative rate | 0.00 / 0.00 |
| Pairwise ROC-AUC | 1.00 |
| Brier score | 0.49092751 |
| 10-bin expected calibration error | 0.49541146 |
| Below-threshold review display | 1 of 2 samples |

These are descriptive convenience-sample calculations, **not a claim of 100% system accuracy or an accuracy improvement**. The raw HUMAN decision happens to agree with SE_ME's reported authorship while its AI softmax score is extremely high. The large Brier/ECE values illustrate that issue on these examples; two observations cannot establish population calibration, and the UI does not present softmax scores as verified authorship frequencies. The presentation's uncertain result is not counted as a proven human-authorship finding.

The production metadata separately reports an earlier 12,000-sample test: accuracy 0.9535, precision 0.9696, recall 0.9363, F1 0.9527, AUC 0.9921, FPR 0.0293, FNR 0.0637, TN 5,824, FP 176, FN 382, TP 5,618. These are **archival metadata**, not results independently reproduced here. Its documented source/domain false-positive limitation remains relevant.

No held-out, provenance-labelled human-edited AI, grammar-corrected human, mixed-author, long academic, or broad formal/informal corpus was supplied. The two documents do not fill those categories. PDF/DOCX/legacy TXT extraction and real inference are covered by integration fixtures, but those generated fixtures are functional tests, not authorship ground truth. Legacy DOC and image-only document attachments without extractable text fail explicitly; no OCR or DOC converter has been invented. Image activities still use the existing image detector. General reliability, domain imbalance, leakage, threshold tuning, and calibration improvement require a larger separate validation/test collection. There was insufficient evidence to justify retraining, calibration fitting, or changing the validated thresholds.

The runtime's SentencePiece byte-fallback warning is recorded as a preprocessing limitation. The installed Transformers Mistral-regex warning also fires for the offline cached DeBERTa base config, which has `model_type: deberta-v2` and no `transformers_version`; inspection of its local generic patch helper explains that warning path. It does not establish that a Mistral regex correction is appropriate for this model. No tokenizer correction flag was applied. The existing official cached tokenizer behavior is preserved, fingerprinted, and loaded locally; the training tokenizer snapshot/data are needed before any preprocessing change can be validated.

### Reproduce the document evaluation

From `backend`, after `npm.cmd run build`, create a private manifest such as:

```json
[
  { "path": "C:/path/SE_AI.docx", "authorship": "ai", "provenance": "Author confirmed generation with GPT; record prompt/date and subsequent editing if available." },
  { "path": "C:/path/SE_ME.docx", "authorship": "human", "provenance": "Author confirmed their own writing; retain drafts and describe editing assistance." }
]
```

Run `node tests/evaluate-documents.mjs tests/private-evaluation.manifest.json ../docs/sample-evaluation.json`. The local manifest is ignored by Git. Use a different output path to retain this baseline when expanding the dataset. Provide honest mixed/unknown labels where binary authorship is not justified. Do not tune thresholds against these same demonstration files and then report them as untouched test performance.

## College academic records and enrollment

Departments use a single canonical catalog: BSIT (Information Technology), BSHM (Hospitality Management), BSCRIM (Criminology), BSED (Secondary Education), and BEED (Elementary Education), with their full program names in the selectors. Numeric year identifiers 1–4 map to 1st Year–4th Year. Searchable keyboard comboboxes accept only catalog options; typed search text never becomes an official identifier.

The existing class creation/management, student enrollment/settings, eligible-subject list, class cards, and rating reports now use department/year values. The eligible list defaults to open classes matching the student's official record and excludes existing enrollment/pending requests. Search remains available. Section is shown when available and is not a newly invented enrollment restriction.

Students with missing or incorrect records submit a pending academic verification/correction request. Their official profile does not change on submission. A designated teacher account with the narrow `can_verify_academics` permission can review on the teacher home screen. Ordinary teachers and students cannot review, grant that permission through the application, self-approve, or view another student's private request history. Approval locks the request/student/reviewer records and checks the original official snapshot; rejection leaves the official profile unchanged. A newer official assignment requires rejection and a fresh request rather than an overwrite.

There was no administrator role or separate department model to reuse. No new auth role was added. School-year, semester, capacity, irregular-student, and cross-department exception policies were not present in this schema; none were invented or bypassed. Existing teacher ownership, class membership, COR approval, and duplicate guards remain in place.

### Additive migration and operator setup

The existing lazy classroom initializer calls `ensureCollegeSchema`:

- Adds `departments` (five canonical codes), nullable user/class department foreign keys and checked year identifiers, and the reviewer flag defaulting to false.
- Adds pending academic requests with original official snapshots, review actor/time/note, and one pending request per student.
- Adds department/year declarations to the existing enrollment request and a UUID analysis lease to the existing submission.
- Maps only confirmed legacy aliases `1st year`, `2nd year`, `3rd year`, `4th year`, and `4rth year` when year is missing. Raw legacy `grade_level` columns remain intact. Values such as `7`, `mkjlkj`, and `7mkjlkj` are not guessed into college assignments or offered as selector options. Department is never inferred.
- Retains all historical memberships, submissions, grades, audit history, and foreign-key relationships. Old pending requests without college declarations can be rejected and resubmitted; accepting them cannot bypass confirmation.

Build/restart the backend and open an authenticated classroom screen once to initialize the schema. From `backend`, an authorized database operator may then run:

```powershell
node manage-academics.mjs grant-reviewer TEACHER_ID
node manage-academics.mjs revoke-reviewer TEACHER_ID
node manage-academics.mjs assign-student STUDENT_ID BSIT 2 "Rizal"
```

The first two target individual teacher accounts. The last targets a student and validates catalog values. Prefer the audited request/review workflow for corrections. The old arbitrary-grade assignment utility is retired. No real account was granted reviewer permission or assigned a department during this implementation; integration tests grant permissions only to their own temporary fixture accounts and remove those fixtures.

### API contract

All routes remain under `/api/classes` and use existing cookie authentication:

| Route | Behavior |
| --- | --- |
| `GET /academic/options` | Catalog and authenticated review capability |
| `GET /academic/profile` | Own official profile and verification history |
| `POST /academic/verification-requests` | Student request with `departmentCode`, numeric `yearLevel`, optional `section` |
| `GET /academic/review` | Designated staff review queue |
| `PATCH /academic/review/:id` | Designated staff approve/reject with optional note |
| `POST /join/lookup` | Code alone; public class metadata, eligibility reason, caller's own enrollment/request status; no roster, activity content, or grades |
| `POST /join` | Existing COR payload plus selected department/year; selected = official = class must hold |
| `PATCH /enrollment-requests/:id` | Existing owning-teacher review; rechecks stored declaration and official/class values before acceptance |
| `GET /eligible` | Fresh official profile and matching available subjects/catalog |
| `PATCH /:id/enrollment-settings` | Owning teacher configures department/year/open state |

A valid code remains verifiable when official data is missing, the class is closed, or academics mismatch. Lookup explains that condition; it does not create a membership. The existing COR request and teacher acceptance are still required for eligible students.

## Verification

Executed successfully against the local project/database:

- Backend TypeScript build and frontend production build.
- 17 backend detection/contract/metrics/rubric tests; 12 Python detector/explanation tests.
- Six rendered detection UI tests plus rubric/college selector/report export SSR checks, including Unicode, exact offsets, invalid evidence, unavailable results, HTML escaping, CSV formula protection, and long print tables.
- 42 college HTTP assertions, all 20 catalog combinations, 380 mismatches, permission denial, approval/rejection/stale requests, private metadata projection, and idempotent malformed-legacy normalization.
- 96 existing grading/enrollment HTTP assertions after adapting their selections to college identifiers; approved grades, objective assistance, audit history, resubmission, legacy memberships, and exports remain covered.
- Document-access authorization suite.
- Full real-model integration: all three models, DOCX/PDF/legacy TXT extraction, database/API agreement, one detector per submission, batch analysis, unchanged grades, no external Node detector calls, unavailable worker behavior, and a genuine overlapping-analysis race yielding one saved result and one 409.
- Supplied documents evaluated twice with identical baseline scores. Final stored sample artifact includes measured logits and passage effects.

Repository-wide frontend lint still reports three pre-existing Fast Refresh export errors in `components/ui/form.tsx`, `context/GoogleAuthProvider.tsx`, and `theme/ThemeContext.tsx`, plus the existing TeacherScreen callback-dependency warning. The production build passes. Browser interaction and print-dialog visual review were not performed in this environment; SSR and API tests do not substitute for those manual checks. Vite's existing large-chunk warning remains.

Reproducible commands (run each from the indicated directory):

```powershell
# backend
npm.cmd run build
node --import tsx --test tests/detection.test.ts tests/prediction-contract.test.ts tests/evaluation-metrics.test.mjs tests/rubric-assessment.test.ts
node tests/college-integration.mjs
node tests/lms-integration.mjs
node tests/document-access.mjs
node tests/integration.mjs

# repository root
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_*.py"

# frontend
npm.cmd run build
node --import ../backend/node_modules/tsx/dist/loader.mjs --test tests/detection-ui.test.tsx
node tests/lms-ui.mjs
```

## Defense demonstration

1. Use an existing teacher to create a BSIT / 2nd Year class with the normal generated code and a document activity. Existing classes can be configured through Subject enrollment. Keep existing grading/rubric choices.
2. Log in as a student without official academic data. Enter the real class code: show the class metadata and verification-required message. Submit BSIT / 2nd Year academic verification; demonstrate that the official profile remains unassigned.
3. Use an individually designated staff reviewer to approve the request. Refresh the student's academic profile (the panels also poll). Select BSIT and 2nd Year in enrollment, verify the same code, upload the real COR, and submit the usual enrollment request. The class teacher approves it; show the class on the student's dashboard.
4. Verify a real class assigned to another department/year. Show its valid code and precise eligibility explanation. A manipulated join request still fails server-side.
5. Submit SE_ME to the document activity and analyze it. Show the exact extracted excerpt, synchronized 99.09% AI / 0.91% human scores, raw threshold decision, and explicit uncertainty label. Explain that the softmax score is not calibrated authorship certainty and the threshold was preserved.
6. Submit SE_AI using a separate activity/submission and analyze it. Its measured baseline is about 99.9937% AI, exceeding the threshold. Expand Advanced evidence, select a passage, and show baseline minus masked score equals its signed influence. Select a negative or neutral passage if present; do not invent one for the demonstration.
7. Review rubric suggestions, supply teacher-only judgments, approve the official grade, and export the latest rating. Reanalyze and demonstrate that the approved academic grade is unchanged.

The demonstration uses actual model inference and normal verification/COR approvals. Do not promise a human-likely score for a known human document or substitute archived results for a new run.
