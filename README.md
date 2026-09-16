# TrueSight

AI-powered academic integrity management system for classroom submissions. The app lets students submit text, documents, and images, while teachers review AI-detection results, class activity, and submission history.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, PostgreSQL
- Text detection: local DeBERTa-v3-base V3
- Code detection: local CodeT5-tokenized BiLSTM
- Image detection: local EfficientNetV2 Keras model through Python/TensorFlow

## Production Detectors

| Type | Model location | Frozen AI threshold |
| --- | --- | --- |
| Text | `models/text_detector/` | >= 0.9913054109 |
| Code | `models/code_detector/truesight_code_detector.pt` | >= 0.54 |
| Image | `models/image_detector/efficientnetv2_ai_human.keras` | > 0.50 |

All models load once in the existing Python worker. Routing uses the activity's
submission type. Sapling is no longer an active provider and no API key is needed.
Teacher analysis actions, saved submissions, and existing probability cards are
preserved. Failed analysis keeps submissions pending with null scores.

See [local detector setup, architecture, and tests](docs/local-detector-integration.md).

## Project Structure

```text
project-root/
  backend/
    config/
    routes/
    services/
      InferenceService.ts
      DetectorRouter.ts
      TextService.ts
      ImageService.ts
      local_detectors.py
      efficientnetv2_predict.py
    tests/
    requirements.txt
    package.json
    server.ts
  frontend/
  models/
    text_detector/
    code_detector/
    image_detector/
  docs/
  scripts/
```

The current backend layout is intentionally kept simple instead of forcing a larger `backend/app` migration.

## Environment Variables

Create `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=5432
DB_NAME=database_name
DB_USER=postgres
DB_PASSWORD=replace_me
JWT_SECRET=replace_me

# Optional when the default python executable is not the TensorFlow environment.
PYTHON_EXECUTABLE=C:\Path\To\TrueSight\.venv\Scripts\python.exe

# Sandboxed compiler API for Java, JavaScript, Python, and Dart.
# The default is Judge0's development endpoint. Configure a self-hosted or
# managed Judge0-compatible endpoint for production deployments.
CODE_EXECUTION_API_URL=https://ce.judge0.com
# CODE_EXECUTION_API_KEY=replace_me
# CODE_EXECUTION_API_KEY_HEADER=X-Auth-Token

# Worker startup / inference timeouts. Thresholds come from frozen model settings.
AI_STARTUP_TIMEOUT_MS=600000
AI_INFERENCE_TIMEOUT_MS=120000
# Set after the official tokenizers have been cached:
# HF_HUB_OFFLINE=1
```

## Backend Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe scripts/prepare_tokenizers.py
cd backend
npm.cmd install
npm.cmd run dev
```

The backend starts on `http://localhost:5000` by default.

Python dependencies are listed in `backend/requirements.txt`:

- `tensorflow`
- `numpy`
- `pillow`
- `torch`
- `transformers==4.57.6`
- `huggingface_hub==0.36.2`
- `sentencepiece`

Use a Python version supported by your installed TensorFlow package. If you use a virtual environment, set `PYTHON_EXECUTABLE` to that environment's Python executable.

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173` by default.

## Detection Flow

Students save submissions using the existing workflow. A teacher's Analyze action
sends exactly one request to the detector selected by `activities.submission_type`:
`essay`/`file` -> text, `code` -> code, `image` -> image. Results use the existing
PostgreSQL fields and teacher UI. No historical results are rewritten.

Image preprocessing retains EXIF handling, RGB conversion, bilinear 224x224 resize,
and one external /255 rescale. The model's > 0.50 decision is displayed directly.
The production thresholds are frozen and have no environment overrides.

`GET /health` reports each model's readiness without exposing paths.
See [verification commands](docs/local-detector-integration.md#verification) for
real model, database, routing, and regression tests.

## Useful Checks

Backend TypeScript:

```powershell
cd backend
.\node_modules\.bin\tsc.cmd --noEmit
```

Frontend build:

```powershell
cd frontend
npm run build
```

Python syntax:

```powershell
python -m py_compile backend\services\efficientnetv2_predict.py
```

## Cleanup Notes

Active model artifacts remain in their existing text_detector, code_detector, and image_detector subfolders under `models/`. Build output, logs, temporary uploads, Python caches, local virtual environments, and large model binaries are ignored by Git.
