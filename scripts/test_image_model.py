import argparse
import importlib.util
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREDICTOR_PATH = ROOT / "backend" / "services" / "efficientnetv2_predict.py"
DEFAULT_MODEL_PATH = ROOT / "models" / "image_detector" / "efficientnetv2_ai_human.keras"
DEFAULT_LABELS_PATH = ROOT / "models" / "image_detector" / "labels.json"
DEFAULT_SAMPLES_DIR = ROOT / "demo_samples"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def load_predictor_module():
    spec = importlib.util.spec_from_file_location(
        "efficientnetv2_predict",
        PREDICTOR_PATH,
    )

    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load predictor script: {PREDICTOR_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def iter_images(samples_dir):
    for path in sorted(samples_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            yield path


def expected_from_path(path):
    parts = {part.lower() for part in path.parts}

    if "human" in parts:
        return "Human"

    if "ai_generated" in parts or "ai-generated" in parts:
        return "AI-generated"

    return None


def print_result(path, result, expected):
    prediction = result["label"]
    confidence = result["confidence"] * 100
    ai_probability = result["aiProbability"] * 100
    human_probability = result["humanProbability"] * 100
    expected_text = f" | expected={expected}" if expected else ""

    print(
        f"{path.name}: prediction={prediction} | confidence={confidence:.2f}% "
        f"| AI={ai_probability:.2f}% | Human={human_probability:.2f}%{expected_text}"
    )


def run_pass(predictor, runtime, images, threshold, uncertain_band):
    config = predictor.get_config(
        threshold=threshold,
        human_confident_max=max(0.0, threshold - uncertain_band),
        ai_confident_min=min(1.0, threshold + uncertain_band),
    )
    counts = {"Human": 0, "AI-generated": 0, "Needs Review": 0}
    correct = 0
    wrong = 0
    review = 0
    known = 0

    print(
        "\nThreshold "
        f"{threshold:.2f} | review band "
        f"{config['human_confident_max']:.2f}-{config['ai_confident_min']:.2f}"
    )
    print("-" * 72)

    for image_path in images:
        expected = expected_from_path(image_path)

        try:
            result = predictor.predict_image_bytes(
                runtime,
                image_path.read_bytes(),
                config=config,
            )
        except Exception as error:
            print(f"{image_path.name}: ERROR | {error}")
            continue

        prediction = result["label"]
        counts[prediction] = counts.get(prediction, 0) + 1
        print_result(image_path, result, expected)

        if expected:
            known += 1
            if prediction == "Needs Review":
                review += 1
            elif prediction == expected:
                correct += 1
            else:
                wrong += 1

    print("-" * 72)
    print(
        "Summary: "
        f"Human={counts.get('Human', 0)}, "
        f"AI-generated={counts.get('AI-generated', 0)}, "
        f"Needs Review={counts.get('Needs Review', 0)}"
    )

    if known:
        print(
            f"Known-label check: correct={correct}, wrong={wrong}, "
            f"needs_review={review}, total_known={known}"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Test the local EfficientNetV2 image model against demo samples.",
    )
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--labels", type=Path, default=DEFAULT_LABELS_PATH)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES_DIR)
    parser.add_argument(
        "--thresholds",
        default=os.environ.get("IMAGE_TEST_THRESHOLDS", "0.40,0.45,0.50,0.55,0.60"),
        help="Comma-separated thresholds to test.",
    )
    parser.add_argument(
        "--uncertain-band",
        type=float,
        default=0.10,
        help="Distance around each threshold treated as Needs Review.",
    )
    args = parser.parse_args()

    if not args.model.is_file():
        raise SystemExit(f"Model file not found: {args.model}")

    if not args.labels.is_file():
        raise SystemExit(f"labels.json not found: {args.labels}")

    if not args.samples.is_dir():
        raise SystemExit(f"Sample folder not found: {args.samples}")

    images = list(iter_images(args.samples))

    if not images:
        raise SystemExit(
            f"No sample images found in {args.samples}. "
            "Add images under demo_samples/human, demo_samples/ai_generated, or demo_samples/mixed."
        )

    thresholds = [
        float(value.strip())
        for value in args.thresholds.split(",")
        if value.strip()
    ]
    predictor = load_predictor_module()
    runtime = predictor.load_runtime(str(args.model), str(args.labels), warmup=True)

    for threshold in thresholds:
        run_pass(predictor, runtime, images, threshold, args.uncertain_band)


if __name__ == "__main__":
    main()
