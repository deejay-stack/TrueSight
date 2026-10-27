# Document preview and AI explainability enhancement

## Existing architecture traced before implementation

| Responsibility | Existing implementation |
| --- | --- |
| Frontend / themes | React 19, TypeScript, Vite 8, Tailwind 4; `AuthContext` applies the root dark class; role colors come from `theme/roleThemes.ts`. Existing design changes in the working tree were preserved. |
| Authentication | Cookie JWT authentication in `backend/routes/auth.ts`; `protect` and class/owner checks in `backend/routes/classes.ts`. |
| Upload preparation | `frontend/src/utils/documentPreview.ts`: validates existing purposes and size limits, reads file data URLs, and stores local draft previews in sessionStorage. |
| Assignment submission | `StudentSubmissionPage.tsx`, `StudentSubmissionModal.tsx`, `classService.ts`, and `POST /api/classes/activities/:activityId/submissions`. |
| File storage | Original data URLs, filenames, MIME types, and sizes are stored in PostgreSQL, in submission, activity-attachment, and enrollment-request records. This flow does not serve arbitrary filesystem paths. |
| Original file retrieval | Existing `GET /api/classes/documents/:documentType/:documentId`, with teacher class access / student ownership checks. Activity attachments use existing class-access checks. |
| Previous preview | `DocumentViewerPage.tsx` rendered images, text, and a native PDF iframe; Word files had a browser-limitation message. |
| COR review | `StudentScreen.tsx` prepares the image; `TeacherUploadsSection.tsx` receives authorized COR bytes from `GET /api/classes/enrollment-requests` and preserves its existing accept/reject callbacks. |
| Teacher review / reports | `SubmissionDetailPage.tsx`, `SubmissionAnalysisReportPage.tsx`, class manager, and existing analyze/evaluation endpoints. |
| Text extraction | `FileTextExtractor.ts`: PDF through pdf-parse, DOCX through backend Mammoth, TXT through UTF-8 decoding. Unchanged. |
| AI orchestration | `DetectorRouter.ts` routes essay/file to text, code to code, and image to image. `InferenceService.ts` communicates with one persistent Python subprocess. There is no active FastAPI server in this repository. |
| Text detector | `local_detectors.py`: trained DeBERTa, original 512-token inference, frozen threshold `0.9913054109`, with existing sentence occlusion. |
| Code detector | Existing CodeT5 tokenizer and packed bidirectional LSTM, sigmoid, frozen threshold `0.54`. |
| Image detector | Existing EfficientNetV2L, original RGB/resize/rescale path, AI decision strictly above `0.5`. |
| Result persistence | Existing analysis endpoint stores probabilities, classification, and `analysis_details` JSONB. Grading and feedback remain separate. |

## Implementation

`DocumentPreview` is shared by document pages, teacher review/report, student draft/COR previews, and teacher COR review. Students can reopen their stored COR from enrollment history. The class manager's existing preview links continue through the same document route. No upload restrictions, authentication, grading, submission deadlines, code execution, or approval rules were changed.

### PDF

PDF.js renders page canvases locally using a bundled worker. Page controls, vertical scrolling, page count, zoom, and fit-width reset are included. Rendering is deferred until pages approach the viewport; canvases outside it are released to limit memory use. Password-protected or damaged PDFs show a recoverable download fallback. Paper remains white while the viewer controls follow the selected theme.

### DOCX

Frontend Mammoth converts the already-authorized original bytes into readable HTML. DOMPurify then allowlists document structure and strips scripts, styles, event handlers, links, and unsafe content. An additional pass removes non-raster or remote images. Only the sanitized HTML is inserted. Paragraphs, headings, lists, tables, and basic emphasis are supported; complex pagination and exact fonts are not guaranteed. The original bytes are unchanged.

### Images, text, code, and unsupported formats

Images preserve aspect ratio and fit the available viewer area; zoom scales that fitted image. Text uses escaped React text with preserved line breaks. Source code reuses the existing CodeMirror component in read-only mode, including line numbers and available language highlighting. The viewer does not execute code. Existing explicit Run Code controls remain separate.

Legacy binary DOC and other unsupported formats show a clear message and Download original control. Render errors are isolated from the surrounding grading/review page. Downloads use the existing authorized bytes through a temporary object URL, revoked on cleanup.

### Full screen and mobile

The existing Radix dialog dependency supplies a viewport-sized modal, keyboard focus management, Escape-to-close, and focus return. Theme variables are carried into the portal. The review form stays mounted, preserving unsaved values. A nested COR full-screen viewer closes back into COR review. Large displays place original preview and analysis side by side; smaller screens use keyboard-accessible tabs.

### Sentence scores and heatmaps

The original full-document inference runs exactly as before and remains the authoritative classification. Afterward, a separate supporting layer scores the first **24 meaningful sentences** independently, in batches of **2**, through the same already-loaded DeBERTa model/tokenizer. Each segment has at most **512 tokens**. Additional scoring is limited to **2,048 tokens** in total and a **12-second budget checked between batches**, so long-document coverage may stop earlier. Passages shorter than 12 characters or containing fewer than 8 letters are skipped, avoiding page counters from PDF extraction. Truncated suffixes and unassessed text are not highlighted. UTF-16 offsets keep browser highlights aligned, including emoji and repeated sentences.

The existing sentence-occlusion explanation remains available under Advanced evidence. It measures changes in the original context; it is not a sentence probability. The new independent scores measure a different input and may disagree with the document score. Neither scores nor counts are averaged into the document result. Explanation failures leave valid document probabilities intact.

Display bands are centralized in `analysisPresentation.ts`: below 40% low, 40–69.99% moderate, 70% or above high AI indication. These bands do not replace any frozen model threshold. Confidence categories use the preexisting mapping: below 60% Low, 60–71.99% Moderate, 72–84.99% High, and 85%+ Very High. Confidence is the larger model probability, not measured correctness.

New explanation data is saved in the existing JSONB result. There is no migration or automatic rewrite of old analyses. Re-run analysis for older results to generate independent scores.

| Submission | Available explanation |
| --- | --- |
| Essay / typed text | Original result, independent sentence probabilities, coverage, counts, heatmap, and prior occlusion evidence. |
| DOCX / text-bearing PDF | Existing extraction feeds the same text detector and explanation layer; original document and extracted-text heatmap remain separate. |
| Legacy TXT | Existing extractor and text detector supply the same explanation; new file-activity TXT uploads remain restricted by the existing rules. |
| Source code | Original overall probability, confidence, classification, and model rationale. Reliable line/function attribution is explicitly unavailable. |
| Images | Original probabilities, confidence, classification, and model rationale. Region attribution / Grad-CAM was not introduced. |

## API, dependencies, and compatibility

The existing document endpoint is extended with the read-only kind `GET /api/classes/documents/cor/:requestId`. This is necessary because students' enrollment-history responses contain COR metadata but not the stored bytes. The new kind authorizes only the uploading student or the teacher of that class, including while an enrollment request is pending or rejected. It does not approve enrollment or expose documents to classmates. Existing submission/activity-attachment access checks remain in place.

The existing submission-document GET response also adds optional `code` and `language` metadata so standalone code previews choose the correct renderer. No new analysis endpoint or database schema was introduced.

Frontend dependencies added: `pdfjs-dist` 6.4.299, `mammoth` 1.13.0, `dompurify` 3.4.17 (versions recorded in package-lock). PDF/Word libraries are loaded in separate chunks. No new Python or backend package is required.

Existing file assignments accept PDF/DOCX, and COR intake accepts PNG/JPEG/WEBP. Those restrictions are preserved. The viewer can render legacy TXT files and legacy PDF COR records, but it does not broaden upload permissions. Scanned PDFs have no OCR; if existing extraction produces no text, no fabricated heatmap is shown. Sentence scoring is bounded and does not cover an arbitrarily long document. DOCX previews do not promise Word-identical layout. PDF canvas content is not a full annotation/form editor.

The report previously displayed an arbitrary legacy `metrics` object. It is now labeled Stored analysis metadata, with an explicit distinction between dataset metrics and individual predictions. No underlying metric values were altered, and no per-submission accuracy/F1 was invented. Missing legacy score cards no longer default to fabricated zero values.

## Files created by this enhancement

- `backend/services/segment_explanations.py`
- `backend/tests/test_segment_explanations.py`
- `backend/tests/preview-fixtures.mjs`
- `backend/tests/browser-preview.mjs`
- `backend/tests/document-access.mjs`
- `frontend/src/components/documents/AuthorizedDocumentPreview.tsx`
- `frontend/src/components/documents/DocumentPreview.tsx`
- `frontend/src/components/documents/DocxViewer.tsx`
- `frontend/src/components/documents/PdfViewer.tsx`
- `frontend/src/components/documents/ImageViewer.tsx`
- `frontend/src/components/documents/PreviewStatus.tsx`
- `frontend/src/utils/filePreview.ts`
- `frontend/src/utils/docxPreview.ts`
- `frontend/src/utils/analysisPresentation.ts`
- `frontend/src/screens/teacher/components/AnalysisSummary.tsx`
- `frontend/src/screens/teacher/components/SegmentHeatmap.tsx`
- `frontend/src/screens/teacher/components/SubmissionReviewWorkspace.tsx`
- `docs/document-review-enhancements.md`

## Files modified by this enhancement

- `backend/routes/classes.ts`
- `backend/services/DetectionResult.ts`
- `backend/services/local_detectors.py`
- `backend/tests/integration.mjs`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.ts`
- `frontend/src/index.css`
- `frontend/src/services/classService.ts`
- `frontend/src/screens/shared/DocumentViewerPage.tsx`
- `frontend/src/screens/student/StudentScreen.tsx`
- `frontend/src/screens/student/StudentSubmissionPage.tsx`
- `frontend/src/screens/teacher/SubmissionDetailPage.tsx`
- `frontend/src/screens/teacher/SubmissionAnalysisReportPage.tsx`
- `frontend/src/screens/teacher/components/TeacherUploadsSection.tsx`
- `frontend/src/screens/teacher/components/TextEvidencePanel.tsx`
- `frontend/src/screens/teacher/components/AIExplainabilityPanel.tsx`
- `frontend/src/screens/teacher/components/MultiLevelAIDetectionPanel.tsx`
- `frontend/tests/detection-ui.test.tsx`

Other design changes already present before this task were preserved and are not included in this enhancement's file list.

## Running

Dependencies were installed in this workspace. On another checkout run `npm.cmd install` in `frontend`. Restart the backend and frontend with their existing `npm.cmd run dev` commands. Re-run analysis on existing submissions to obtain independent sentence scores; no database command is required.

Verification commands:

```powershell
# Project root
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p test_*.py
npm.cmd run build --prefix backend
npm.cmd run build --prefix frontend

# frontend
..\backend\node_modules\.bin\tsx.cmd --tsconfig tsconfig.app.json --test tests/detection-ui.test.tsx tests/theme-contrast.test.ts

# backend; real PostgreSQL + existing model files / tokenizer cache required
node tests/integration.mjs
node tests/document-access.mjs
```

The optional browser branch (`TRUESIGHT_BROWSER_TEST=1`) expects a frontend at `http://127.0.0.1:5174` configured with `VITE_API_BASE_URL=http://127.0.0.1:5107/api`, plus a dedicated local headless browser debugging endpoint on port 9223. It uses actual temporary users and API records, not mocked detector responses. Browser screenshots are written under ignored `.tmp/preview-verification`. Fixture users and their related records are deleted by the integration test's `finally` cleanup.

## Verification completed

- Backend and frontend production builds passed; targeted lint on the new viewer, analysis components, and utilities passed.
- 12 Python tests passed, covering existing frozen boundaries, packed-code behavior, image preprocessing, occlusion, independent-score offsets, bounded batches, truncation, and rejection of invalid model values.
- 11 frontend rendering/contrast tests passed, including the authoritative HUMAN result at 98% AI, independent heatmap counts, byte-preserving preview utilities, legacy explanation fallback, failure states, and both role themes.
- Real PostgreSQL/model integration passed teacher/student signup and login, class creation, COR upload/rejection/resubmission/approval, enrollment, activity creation, essay/code/image/DOCX/PDF submissions, authorized original-byte retrieval, unrelated-student/unauthenticated denial, legacy TXT extraction, persisted explanations, grading/remarks/comments, history, six-submission batch analysis, and controlled worker failure. The stored text/essay fixture remained 98.60% AI / HUMAN, code 54.49% / AI, image 53.55% / AI, and DOCX 78.84% / HUMAN.
- Headless Edge checks against actual temporary API users/records passed essay/code/image/DOCX/PDF/TXT preview, two PDF pages, zoom, full screen, Escape close, mobile layout, the real file heatmap, light/dark toggle, and retained unsaved grading. Sanitization and unsupported/corrupt-file fallbacks passed. Image COR review and legacy PDF COR page/full-screen viewing passed without removing approval controls.
- Original submission bytes were compared with API upload payloads. No external Node detection requests occurred. Temporary database fixtures were cleaned up.
- The dedicated stored-COR access test checks its uploading student, the class teacher, unrelated students/teachers, unauthenticated readers, invalid IDs, and access after rejection without creating enrollment.
- A final real DeBERTa smoke check after adding the processing budget retained the original 98.60% AI / HUMAN result and returned genuine sentence probabilities within the token budget.

These checks are local regression evidence, not an assertion that every possible Word layout, font, encrypted PDF, scanned document, or browser has been tested.
