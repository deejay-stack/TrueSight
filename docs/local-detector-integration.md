# Local detector integration

The existing Python JSON-lines worker now loads all three models once. Express
owns authentication, assignment validation, submission persistence, teacher
analysis actions, and evaluation. No second Python HTTP service is required.

## Routing and decisions

| Activity `submission_type` | Detector | Decision |
| --- | --- | --- |
| `essay`, `file` (PDF/DOCX extracted text) | DeBERTa-v3-base V3 | AI when p >= 0.9913054109 |
| `code` (typed source, whitespace preserved) | CodeT5-tokenized BiLSTM | AI when p >= 0.54 |
| `image` | EfficientNetV2L | AI when p > 0.50 |

The activity row determines the detector, including batch analysis. Filenames
never select another detector. Image bytes are never OCR'd or sent to text/code
models. Code execution remains independent of code detection.

Text uses the official `microsoft/deberta-v3-base` tokenizer and the existing
local safetensors. Its production JSON supplies the threshold and labels; startup
rejects incompatible metadata. Code uses `Salesforce/codet5-small` only as its
tokenizer. The classifier uses the author's confirmed packed BiLSTM forward
pass: attention-mask lengths, final forward/backward hidden states concatenated,
Dropout(0.3), Linear(256,1), then sigmoid during inference. Checkpoint weights are
loaded strictly, with metadata validation.

Image preprocessing retains the existing EXIF handling, RGB conversion,
bilinear 224x224 resizing, and single external /255 rescaling. The production
worker fixes the threshold at 0.50 and uses the model's binary decision rather
than the former 40–60% review band. No trained artifacts are changed.

## Results and failure handling

Python returns 0–1 probabilities and the detector's label. The Express adapter
preserves the existing 0–100 `aiProbability`, `humanProbability`, and confidence
fields. It stores the original probabilities in `analysis_details.probabilities`
and metadata in the same JSONB column. `is_ai_generated` comes from the model's
decision; it is never recalculated from rounded percentages. Thus 98% AI with
the text threshold intentionally remains HUMAN. Analytics uses that stored
decision, too.

New analysis has no Sapling, Winston, GPTZero, heuristic, or demo fallback. The
unused old route-local GPTZero helpers have no callers. Existing historical
analysis records are not migrated. A failed request writes `analysisStatus:
"failed"`, keeps the submission pending, and stores null scores. Batch processing
continues and reports the failure count. Teacher grades and remarks are untouched
by analysis. The UI displays the stored decision and probabilities as guidance.

## Startup

From the project root, with a compatible Python environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe scripts/prepare_tokenizers.py
cd backend
npm.cmd run dev
```

Set `PYTHON_EXECUTABLE` in `backend/.env` to the **absolute** virtual-environment
Python path if it already overrides Python. Otherwise the worker automatically
uses the project's `.venv`, then `python`. This workstation's `.venv` uses Python
3.12 and reuses its existing TensorFlow installation. Transformers is pinned to
4.57.6 and huggingface_hub to 0.36.2. First-time tokenizer caching needs access to
Hugging Face; model weights are always loaded from the existing `models/` folders.
Once cached, set `HF_HUB_OFFLINE=1` to run without tokenizer network checks.

The service resolves paths from its source location, not the launch directory.
The compiled backend locates the same source worker; keep `backend/services/*.py`
and the top-level `models/` directory when deploying. No weights are copied to
`dist` or another model directory. PyTorch selects CUDA if its installation
supports it, otherwise CPU. TensorFlow retains its normal device selection.

`AI_STARTUP_TIMEOUT_MS` defaults to 600000 and `AI_INFERENCE_TIMEOUT_MS` to 120000.
Startup can take time, particularly with the large image artifact. Each model's
load outcome is logged. A failed model stays unavailable until an explicit
backend restart; requests never repeatedly load it or switch detectors.

`GET /health` returns per-model readiness and 200 when all are loaded, otherwise
503. It contains model names and booleans, not filesystem paths. `/api/health`
retains its existing general backend health response.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p test_detectors.py
cd backend
npm.cmd run build
.\node_modules\.bin\tsx.cmd --test tests/detection.test.ts
node tests/integration.mjs
cd ../frontend
npm.cmd run build
..\backend\node_modules\.bin\tsx.cmd --tsconfig tsconfig.app.json --test tests/detection-ui.test.tsx
```

The integration test uses the configured local PostgreSQL database, creates
temporary teacher/student/class fixtures, copies an existing essay assignment's
definition, and exercises real login, submission, individual/batch inference,
database retrieval, history, score, and remarks. It cleans only its own fixture
users and their dependent records. It loads real weights, checks detector logs,
and forbids outbound Node fetch calls to catch accidental provider fallback.
Its generated image is a pipeline smoke sample, not an accuracy benchmark.

Verified locally on 2026-09-17: all three real models loaded; essay (98.60% AI,
HUMAN), code (54.49% AI, AI), image (53.55% AI, AI), and DOCX (78.84% AI, HUMAN)
followed their own thresholds and reached the database and teacher API. Individual
and batch analysis, teacher/student login, grades, remarks, history, and controlled
failure after worker shutdown passed. Temporary database fixtures were removed.
These samples establish integration behavior, not evaluation accuracy.

The old `scripts/test_image_model.py` is an experimental image-only utility;
its threshold comparisons must not be used to change frozen production settings.
