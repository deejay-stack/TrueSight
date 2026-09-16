import base64
import io
import json
import os
import sys
import time


IMAGE_SIZE = (224, 224)
AI_CLASS_INDEX = 1
HUMAN_CLASS_INDEX = 0
NEEDS_REVIEW_LABEL = "Needs Review"


def fail(message, code=1):
    print(json.dumps({"error": message}), flush=True)
    raise SystemExit(code)


def parse_float_env(name, default):
    raw_value = os.environ.get(name)

    if raw_value is None or str(raw_value).strip() == "":
        return default

    try:
        return float(raw_value)
    except ValueError:
        fail(f"{name} must be a number. Received: {raw_value}")


def get_config(
    threshold=None,
    human_confident_max=None,
    ai_confident_min=None,
    input_scale=None,
):
    config = {
        "threshold": threshold
        if threshold is not None
        else parse_float_env("IMAGE_AI_THRESHOLD", 0.5),
        "human_confident_max": human_confident_max
        if human_confident_max is not None
        else parse_float_env("IMAGE_HUMAN_CONFIDENT_MAX", 0.40),
        "ai_confident_min": ai_confident_min
        if ai_confident_min is not None
        else parse_float_env("IMAGE_AI_CONFIDENT_MIN", 0.60),
        "input_scale": (
            input_scale
            if input_scale is not None
            else os.environ.get("IMAGE_MODEL_INPUT_SCALE", "0_1")
        )
        .strip()
        .lower(),
    }

    if not 0.0 <= config["threshold"] <= 1.0:
        fail("IMAGE_AI_THRESHOLD must be between 0 and 1.")

    if not 0.0 <= config["human_confident_max"] <= 1.0:
        fail("IMAGE_HUMAN_CONFIDENT_MAX must be between 0 and 1.")

    if not 0.0 <= config["ai_confident_min"] <= 1.0:
        fail("IMAGE_AI_CONFIDENT_MIN must be between 0 and 1.")

    if config["human_confident_max"] > config["ai_confident_min"]:
        fail("IMAGE_HUMAN_CONFIDENT_MAX must be less than or equal to IMAGE_AI_CONFIDENT_MIN.")

    if config["input_scale"] not in {"raw", "none", "0_255", "0-255", "0_1", "0-1", "zero_one"}:
        fail(
            "IMAGE_MODEL_INPUT_SCALE must be raw or 0_1. "
            f"Received: {config['input_scale']}"
        )

    return config


def load_dependencies():
    try:
        import numpy as np
        from PIL import Image, ImageOps, UnidentifiedImageError
        import tensorflow as tf
    except ImportError as error:
        fail(
            "Python image predictor dependencies are missing. Install tensorflow, pillow, and numpy. "
            f"Original error: {error}"
        )

    return np, Image, ImageOps, UnidentifiedImageError, tf


def load_labels(labels_path):
    if not os.path.isfile(labels_path):
        fail(f"labels.json file was not found: {labels_path}")

    try:
        with open(labels_path, "r", encoding="utf-8") as labels_file:
            labels = json.load(labels_file)
    except json.JSONDecodeError as error:
        fail(f"labels.json is not valid JSON: {error}")
    except OSError as error:
        fail(f"Could not read labels.json: {error}")

    if labels.get("0") != "Human" or labels.get("1") != "AI-generated":
        fail('labels.json must contain {"0": "Human", "1": "AI-generated"}.')

    return labels


def build_batch(image, np, config):
    image_array = np.array(image, dtype=np.float32)

    if config["input_scale"] in {"0_1", "0-1", "zero_one"}:
        image_array = image_array / 255.0

    return np.expand_dims(image_array, axis=0)


def load_runtime(model_path, labels_path, warmup=True, config=None):
    if not os.path.isfile(model_path):
        fail(f"EfficientNetV2 model file was not found: {model_path}")

    config = config or get_config()
    labels = load_labels(labels_path)
    np, Image, ImageOps, UnidentifiedImageError, tf = load_dependencies()
    for device in tf.config.list_physical_devices("GPU"):
        tf.config.experimental.set_memory_growth(device, True)
    load_started = time.perf_counter()

    try:
        model = tf.keras.models.load_model(model_path, compile=False)
    except Exception as error:
        fail(f"EfficientNetV2 model failed to load: {error}")

    load_ms = (time.perf_counter() - load_started) * 1000
    warmup_ms = 0.0

    if warmup:
        try:
            warmup_started = time.perf_counter()
            warmup_batch = np.zeros((1, IMAGE_SIZE[1], IMAGE_SIZE[0], 3), dtype=np.float32)
            model.predict(warmup_batch, verbose=0)
            warmup_ms = (time.perf_counter() - warmup_started) * 1000
        except Exception as error:
            fail(f"EfficientNetV2 warm-up prediction failed: {error}")

    return {
        "np": np,
        "Image": Image,
        "ImageOps": ImageOps,
        "UnidentifiedImageError": UnidentifiedImageError,
        "model": model,
        "labels": labels,
        "config": config,
        "model_path": model_path,
        "labels_path": labels_path,
        "load_ms": load_ms,
        "warmup_ms": warmup_ms,
    }


def decode_image(image_bytes, runtime):
    Image = runtime["Image"]
    ImageOps = runtime["ImageOps"]
    UnidentifiedImageError = runtime["UnidentifiedImageError"]

    if not image_bytes:
        raise ValueError("No image payload was provided for prediction.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as original:
            image = ImageOps.exif_transpose(original)
            image = image.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise ValueError("Invalid image upload. Could not decode uploaded file as an image.")

    resampling = getattr(getattr(Image, "Resampling", Image), "BILINEAR")
    return image.resize(IMAGE_SIZE, resampling)


def build_decision(probability, labels, config):
    human_probability = 1.0 - probability
    model_class_id = AI_CLASS_INDEX if probability > config["threshold"] else HUMAN_CLASS_INDEX
    model_label = labels[str(model_class_id)]

    if probability >= config["ai_confident_min"]:
        label = labels[str(AI_CLASS_INDEX)]
        message = "The submitted image is likely AI-generated."
    elif probability <= config["human_confident_max"]:
        label = labels[str(HUMAN_CLASS_INDEX)]
        message = "The submitted image is likely Human-created."
    else:
        label = NEEDS_REVIEW_LABEL
        message = "The result is uncertain. Manual review is recommended."

    confidence = max(probability, human_probability)

    return label, model_label, confidence, human_probability, message


def predict_image_bytes(runtime, image_bytes, config=None):
    np = runtime["np"]
    model = runtime["model"]
    labels = runtime["labels"]
    active_config = config or runtime["config"]
    total_started = time.perf_counter()
    preprocessing_started = time.perf_counter()
    image = decode_image(image_bytes, runtime)
    batch = build_batch(image, np, active_config)
    preprocessing_ms = (time.perf_counter() - preprocessing_started) * 1000

    prediction_started = time.perf_counter()
    try:
        prediction = model.predict(batch, verbose=0)
    except Exception as error:
        raise RuntimeError(f"EfficientNetV2 prediction failed: {error}") from error

    prediction_ms = (time.perf_counter() - prediction_started) * 1000
    raw_values = np.asarray(prediction).reshape(-1)

    if raw_values.size != 1:
        raise RuntimeError("EfficientNetV2 model must return one sigmoid probability.")

    raw_probability = float(raw_values[0])

    if not np.isfinite(raw_probability) or not 0.0 <= raw_probability <= 1.0:
        raise RuntimeError("EfficientNetV2 model returned an invalid prediction probability.")

    probability = float(np.clip(raw_probability, 0.0, 1.0))
    label, model_label, confidence, human_probability, message = build_decision(
        probability,
        labels,
        active_config,
    )
    total_ms = (time.perf_counter() - total_started) * 1000

    return {
        "label": label,
        "modelLabel": model_label,
        "confidence": float(confidence),
        "aiProbability": float(probability),
        "humanProbability": float(human_probability),
        "threshold": float(active_config["threshold"]),
        "humanConfidentMax": float(active_config["human_confident_max"]),
        "aiConfidentMin": float(active_config["ai_confident_min"]),
        "message": message,
        "classNames": [
            labels[str(HUMAN_CLASS_INDEX)],
            labels[str(AI_CLASS_INDEX)],
        ],
        "probabilities": [
            {
                "label": labels[str(HUMAN_CLASS_INDEX)],
                "probability": float(human_probability),
            },
            {
                "label": labels[str(AI_CLASS_INDEX)],
                "probability": float(probability),
            },
        ],
        "rawOutput": [float(value) for value in raw_values],
        "timings": {
            "preprocessingMs": round(preprocessing_ms, 2),
            "predictionMs": round(prediction_ms, 2),
            "totalMs": round(total_ms, 2),
            "modelLoadMs": round(runtime.get("load_ms", 0.0), 2),
            "warmupMs": round(runtime.get("warmup_ms", 0.0), 2),
        },
        "preprocessing": {
            "convertToRgb": True,
            "exifOrientationHandled": True,
            "resize": "224x224",
            "inputScale": active_config["input_scale"],
        },
    }


def run_one_shot(model_path, labels_path):
    runtime = load_runtime(model_path, labels_path, warmup=False)
    image_bytes = sys.stdin.buffer.read()

    try:
        result = predict_image_bytes(runtime, image_bytes)
    except Exception as error:
        fail(str(error))

    print(json.dumps(result), flush=True)


def run_worker(model_path, labels_path):
    runtime = load_runtime(model_path, labels_path, warmup=True)
    print(
        json.dumps(
            {
                "type": "ready",
                "modelLoaded": True,
                "modelPath": model_path,
                "labelsPath": labels_path,
                "threshold": runtime["config"]["threshold"],
                "humanConfidentMax": runtime["config"]["human_confident_max"],
                "aiConfidentMin": runtime["config"]["ai_confident_min"],
                "inputScale": runtime["config"]["input_scale"],
                "timings": {
                    "modelLoadMs": round(runtime["load_ms"], 2),
                    "warmupMs": round(runtime["warmup_ms"], 2),
                },
            }
        ),
        flush=True,
    )

    for line in sys.stdin:
        request_id = None

        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            image_base64 = payload.get("image")

            if not isinstance(image_base64, str) or not image_base64:
                raise ValueError("No image payload was provided for prediction.")

            image_bytes = base64.b64decode(image_base64, validate=True)
            result = predict_image_bytes(runtime, image_bytes)
            result["id"] = request_id
            print(json.dumps(result), flush=True)
        except Exception as error:
            print(
                json.dumps(
                    {
                        "id": request_id,
                        "error": str(error),
                    }
                ),
                flush=True,
            )


def main():
    args = sys.argv[1:]
    if args == ["--all-models"]:
        run_all_models_worker()
        return
    worker_mode = False

    if args and args[0] == "--worker":
        worker_mode = True
        args = args[1:]

    if len(args) < 2:
        fail("Model path and labels.json path arguments are required.")

    model_path = args[0]
    labels_path = args[1]

    if worker_mode:
        run_worker(model_path, labels_path)
    else:
        run_one_shot(model_path, labels_path)


def run_all_models_worker():
    """Extend the existing JSON-lines worker; one process, one copy per model."""
    from contextlib import redirect_stdout
    from local_detectors import MODELS, MODEL_NAMES, TextDetector, CodeDetector, normalize_result

    runtimes = {}
    health = {}
    loaders = {
        "text": TextDetector,
        "code": CodeDetector,
        "image": lambda: load_runtime(
            str(MODELS / "image_detector" / "efficientnetv2_ai_human.keras"),
            str(MODELS / "image_detector" / "labels.json"),
            config=get_config(threshold=0.50, human_confident_max=0.50, ai_confident_min=0.50, input_scale="0_1"),
        ),
    }
    for detector_type, loader in loaders.items():
        print(f"[ai-model] Loading {MODEL_NAMES[detector_type]}", file=sys.stderr, flush=True)
        try:
            # Libraries must not corrupt the JSON-lines response stream.
            with redirect_stdout(sys.stderr):
                runtimes[detector_type] = loader()
            health[detector_type] = {"loaded": True, "model": MODEL_NAMES[detector_type]}
            print(f"[ai-model] Loaded {MODEL_NAMES[detector_type]}", file=sys.stderr, flush=True)
        except (Exception, SystemExit) as error:
            health[detector_type] = {"loaded": False, "model": MODEL_NAMES[detector_type]}
            print(f"[ai-model] Failed to load {detector_type}: {error}", file=sys.stderr, flush=True)
    print(json.dumps({"type": "ready", "models": health}), flush=True)

    for line in sys.stdin:
        request_id = None
        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            detector_type = payload.get("detectorType")
            if detector_type not in loaders:
                raise ValueError("Unsupported detector type")
            if detector_type not in runtimes:
                raise RuntimeError("Requested model is unavailable")
            with redirect_stdout(sys.stderr):
                if detector_type == "image":
                    image_bytes = base64.b64decode(payload["image"], validate=True)
                    result = predict_image_bytes(runtimes["image"], image_bytes)
                    result.update(normalize_result("image", result["aiProbability"], 0.50))
                    # Strict > at 0.50, including the exact equality boundary.
                    result["label"] = result["modelLabel"]
                    result["message"] = "Likely AI-generated image." if result["predictedLabel"] == "AI" else "Likely human-created image."
                else:
                    result = runtimes[detector_type].predict(payload.get("text"))
            print(f"[ai-inference] detector={detector_type} model={result['modelName']} label={result['predictedLabel']} threshold={result['threshold']}", file=sys.stderr, flush=True)
            print(json.dumps({**result, "id": request_id}, allow_nan=False), flush=True)
        except Exception as error:
            print(f"[ai-inference] Request failed: {error}", file=sys.stderr, flush=True)
            print(json.dumps({"id": request_id, "error": "AI detection temporarily unavailable."}), flush=True)


if __name__ == "__main__":
    main()
