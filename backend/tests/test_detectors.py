import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
from local_detectors import normalize_result, build_code_model, MODELS
from efficientnetv2_predict import build_batch, decode_image, get_config


class DetectorTests(unittest.TestCase):
    def test_frozen_decision_boundaries(self):
        threshold = json.loads((MODELS / "text_detector" / "truesight_text_detector_production.json").read_text())["decision_threshold"]
        self.assertEqual(normalize_result("text", 0.98, threshold)["predictedLabel"], "HUMAN")
        self.assertEqual(normalize_result("text", threshold, threshold)["predictedLabel"], "AI")
        self.assertEqual(normalize_result("code", 0.539999, 0.54)["predictedLabel"], "HUMAN")
        self.assertEqual(normalize_result("code", 0.54, 0.54)["predictedLabel"], "AI")
        self.assertEqual(normalize_result("image", 0.50, 0.50)["predictedLabel"], "HUMAN")
        self.assertEqual(normalize_result("image", 0.500001, 0.50)["predictedLabel"], "AI")

    def test_invalid_output_rejected(self):
        for probability in (float("nan"), float("inf"), -0.1, 1.1):
            with self.assertRaises(ValueError):
                normalize_result("text", probability, 0.9913054109)

    def test_image_rgb_resize_and_single_rescale(self):
        import numpy as np
        from PIL import Image, ImageOps, UnidentifiedImageError
        image = Image.new("RGBA", (20, 30), (255, 255, 255, 255))
        payload = io.BytesIO()
        image.save(payload, format="PNG")
        decoded = decode_image(payload.getvalue(), {"Image": Image, "ImageOps": ImageOps, "UnidentifiedImageError": UnidentifiedImageError})
        batch = build_batch(decoded, np, get_config(input_scale="0_1"))
        self.assertEqual(batch.shape, (1, 224, 224, 3))
        self.assertEqual(batch.dtype, np.float32)
        self.assertTrue(np.all(batch == 1.0))

    def test_checkpoint_and_packed_padding_invariance(self):
        import torch
        checkpoint = torch.load(MODELS / "code_detector" / "truesight_code_detector.pt", map_location="cpu", weights_only=True)
        model = build_code_model(torch, checkpoint).eval()
        model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        with torch.inference_mode():
            short = model(torch.tensor([[1, 42, 2]]), torch.tensor([[1, 1, 1]]))
            padded = model(torch.tensor([[1, 42, 2, 0, 0]]), torch.tensor([[1, 1, 1, 0, 0]]))
        torch.testing.assert_close(short, padded)


if __name__ == "__main__":
    unittest.main()
