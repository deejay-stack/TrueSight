"""Local text/code inference. Weights stay in the project's existing models directory."""
import json
import math
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS = PROJECT_ROOT / "models"
MODEL_NAMES = {"text": "DeBERTa-v3-base V3", "code": "CodeT5-BiLSTM", "image": "EfficientNetV2L"}


def normalize_result(detector_type, ai_probability, threshold, human_probability=None):
    human_probability = 1 - ai_probability if human_probability is None else human_probability
    if not all(math.isfinite(p) and 0 <= p <= 1 for p in (ai_probability, human_probability)):
        raise ValueError("Model returned invalid probabilities")
    if not math.isclose(ai_probability + human_probability, 1, abs_tol=1e-5):
        raise ValueError("Model probabilities do not sum to one")
    is_ai = ai_probability > threshold if detector_type == "image" else ai_probability >= threshold
    return {
        "detectorType": detector_type,
        "predictedLabel": "AI" if is_ai else "HUMAN",
        "aiProbability": ai_probability,
        "humanProbability": human_probability,
        "aiPercentage": ai_probability * 100,
        "humanPercentage": human_probability * 100,
        "threshold": threshold,
        "modelName": MODEL_NAMES[detector_type],
        "status": "completed",
    }


class TextDetector:
    def __init__(self):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.torch = torch
        directory = MODELS / "text_detector"
        config = json.loads((directory / "truesight_text_detector_production.json").read_text(encoding="utf-8"))
        self.threshold = float(config["decision_threshold"])
        if not math.isclose(self.threshold, 0.9913054109, rel_tol=0, abs_tol=1e-10):
            raise ValueError("Unexpected frozen text threshold")
        if config["max_length"] != 512 or config["labels"] != {"0": "HUMAN", "1": "AI"}:
            raise ValueError("Unexpected text model metadata")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained("microsoft/deberta-v3-base")
        self.model = AutoModelForSequenceClassification.from_pretrained(directory, local_files_only=True)
        if self.model.config.num_labels != 2:
            raise ValueError("Text model must have two output logits")
        self.model.to(self.device).eval()

    def predict(self, text):
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Written content must not be empty")
        inputs = self.tokenizer(text, truncation=True, max_length=512, padding=True, return_tensors="pt")
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with self.torch.inference_mode():
            probabilities = self.torch.softmax(self.model(**inputs).logits, dim=-1)[0]
        return normalize_result("text", float(probabilities[1].item()), self.threshold, float(probabilities[0].item()))


def build_code_model(torch, checkpoint):
    """Training architecture confirmed by the model's author."""
    class CodeBiLSTM(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.embedding = torch.nn.Embedding(checkpoint["vocab_size"], checkpoint["embedding_dim"], padding_idx=checkpoint["padding_idx"])
            self.lstm = torch.nn.LSTM(checkpoint["embedding_dim"], checkpoint["hidden_dim"], batch_first=True, bidirectional=True)
            self.dropout = torch.nn.Dropout(checkpoint["dropout"])
            self.classifier = torch.nn.Linear(checkpoint["hidden_dim"] * 2, 1)

        def forward(self, input_ids, attention_mask):
            embedded = self.embedding(input_ids)
            lengths = attention_mask.sum(dim=1).cpu()
            embedded = torch.nn.utils.rnn.pack_padded_sequence(embedded, lengths, batch_first=True, enforce_sorted=False)
            _, (hidden, _) = self.lstm(embedded)
            combined = torch.cat((hidden[-2], hidden[-1]), dim=1)
            return self.classifier(self.dropout(combined)).squeeze(-1)

    return CodeBiLSTM()


class CodeDetector:
    def __init__(self):
        import torch
        from transformers import RobertaTokenizer

        self.torch = torch
        checkpoint = torch.load(MODELS / "code_detector" / "truesight_code_detector.pt", map_location="cpu", weights_only=True)
        expected = {"tokenizer_name": "Salesforce/codet5-small", "embedding_dim": 128, "hidden_dim": 128, "dropout": 0.30, "max_length": 512, "threshold": 0.54}
        if any(checkpoint.get(key) != value for key, value in expected.items()):
            raise ValueError("Unexpected code checkpoint metadata")
        if checkpoint.get("label_mapping") != {0: "Human", 1: "AI"}:
            raise ValueError("Unexpected code label mapping")
        self.threshold = checkpoint["threshold"]
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = RobertaTokenizer.from_pretrained(checkpoint["tokenizer_name"])
        if len(self.tokenizer) != checkpoint["vocab_size"] or self.tokenizer.pad_token_id != checkpoint["padding_idx"]:
            raise ValueError("Code tokenizer does not match checkpoint")
        self.model = build_code_model(torch, checkpoint)
        self.model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        self.model.to(self.device).eval()

    def predict(self, text):
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Source code must not be empty")
        inputs = self.tokenizer(text, truncation=True, max_length=512, padding="max_length", return_tensors="pt")
        with self.torch.inference_mode():
            logit = self.model(inputs["input_ids"].to(self.device), inputs["attention_mask"].to(self.device))
            probability = float(self.torch.sigmoid(logit).item())
        return normalize_result("code", probability, self.threshold)
