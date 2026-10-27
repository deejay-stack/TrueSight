import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
from segment_explanations import explain_segments


class SegmentExplanationTests(unittest.TestCase):
    def detector(self, bad=False):
        import torch
        batches = []
        def tokenize(texts, **options):
            self.assertEqual(options["max_length"], 512)
            batches.append(len(texts))
            offsets = [[(0, 0), (0, min(len(text), 30)), (0, 0)] for text in texts]
            return {"input_ids": torch.ones((len(texts), 3), dtype=torch.long),
                    "attention_mask": torch.ones((len(texts), 3), dtype=torch.long),
                    "offset_mapping": torch.tensor(offsets)}
        def model(**inputs):
            values = torch.zeros((len(inputs["input_ids"]), 2))
            if bad:
                values[:] = float("nan")
            else:
                values[:, 1] = 1
            return SimpleNamespace(logits=values)
        return SimpleNamespace(torch=torch, tokenizer=tokenize, model=model, device="cpu"), batches

    def test_independent_scores_offsets_and_boundaries(self):
        detector, batches = self.detector()
        text = "🙂 Repeated meaningful sentence. Repeated meaningful sentence. Tiny!"
        result = explain_segments(detector, text)
        self.assertEqual(batches, [2])
        self.assertEqual(result["evaluatedSegments"], 2)
        for segment in result["segments"]:
            decoded = text.encode("utf-16-le")[segment["start"] * 2:segment["end"] * 2].decode("utf-16-le")
            self.assertEqual(decoded, segment["text"])
            self.assertAlmostEqual(segment["aiProbability"] + segment["humanProbability"], 1)
        self.assertNotIn("predictedLabel", result)

    def test_limits_and_unscored_truncated_text(self):
        detector, batches = self.detector()
        result = explain_segments(detector, ("A long meaningful sentence with extra text for truncation. " * 40))
        self.assertEqual(result["evaluatedSegments"], 24)
        self.assertEqual(result["availableSegments"], 40)
        self.assertTrue(all(size <= 2 for size in batches))
        self.assertTrue(result["segments"][0]["truncated"])
        self.assertEqual(len(result["segments"][0]["text"]), 30)

    def test_invalid_model_values_rejected(self):
        detector, _ = self.detector(bad=True)
        with self.assertRaises(ValueError):
            explain_segments(detector, "This sentence has meaningful content.")

    def test_extraction_page_counters_are_not_scored(self):
        detector, _ = self.detector()
        result = explain_segments(detector, "A meaningful classroom sentence.\n-- 1 of 2 --\nAnother meaningful classroom sentence.")
        self.assertEqual(result["evaluatedSegments"], 2)
        self.assertTrue(all("of 2" not in item["text"] for item in result["segments"]))

    def test_budget_stops_additional_work_without_fabricating_scores(self):
        detector, batches = self.detector()
        with patch("segment_explanations.MAX_SEGMENT_TOKENS", 6):
            result = explain_segments(detector, "A meaningful classroom sentence. " * 10)
        self.assertEqual(result["evaluatedSegments"], 2)
        self.assertEqual(result["availableSegments"], 10)
        self.assertTrue(result["processingLimitReached"])
        self.assertEqual(batches, [2])


if __name__ == "__main__":
    unittest.main()
