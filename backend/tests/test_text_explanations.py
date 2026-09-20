import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
from text_explanations import explain_text, sentence_spans, utf16_offset


class TextExplanationTests(unittest.TestCase):
    def test_repeated_passages_have_distinct_offsets(self):
        self.assertEqual(list(sentence_spans("Same sentence.  Same sentence.\nNext!")), [(0, 14), (16, 30), (31, 36)])
        self.assertEqual(utf16_offset("🙂 Hello", 2), 3)

    def test_occlusion_keeps_original_input_and_preserves_signed_effect(self):
        import torch
        text = "Positive. Negative."
        ids = torch.tensor([[1, 9, 3, 2]])
        original = ids.clone()
        offsets = [(0, 0), (0, 9), (10, 19), (0, 0)]

        def model(**inputs):
            tokens = inputs["input_ids"]
            score = (tokens == 9).sum(dim=1).float() - (tokens == 3).sum(dim=1).float()
            return SimpleNamespace(logits=torch.stack((torch.zeros_like(score), score), dim=1))

        detector = SimpleNamespace(torch=torch, tokenizer=SimpleNamespace(mask_token_id=0), model=model)
        result = explain_text(detector, text, {"input_ids": ids, "attention_mask": torch.ones_like(ids)}, offsets, 0.5)
        self.assertTrue(torch.equal(original, ids))
        self.assertGreater(result["sentences"][0]["impactPercentagePoints"], 0)
        self.assertLess(result["sentences"][1]["impactPercentagePoints"], 0)
        self.assertFalse(result["truncated"])

    def test_truncation_and_sentence_limit_are_explicit(self):
        import torch
        text = "One. " * 25
        prefix = text[:100]
        ids = torch.ones((1, len(prefix)), dtype=torch.long)
        detector = SimpleNamespace(torch=torch, tokenizer=SimpleNamespace(mask_token_id=0), model=lambda **inputs: SimpleNamespace(logits=torch.zeros((inputs["input_ids"].shape[0], 2))))
        result = explain_text(detector, text, {"input_ids": ids, "attention_mask": torch.ones_like(ids)}, [(i, i+1) for i in range(len(prefix))], 0.5)
        self.assertEqual(result["evaluatedSentences"], 16)
        self.assertEqual(result["availableSentences"], 20)
        self.assertTrue(result["truncated"])
        self.assertTrue(all(entry["impactPercentagePoints"] == 0 for entry in result["sentences"]))


if __name__ == "__main__":
    unittest.main()
