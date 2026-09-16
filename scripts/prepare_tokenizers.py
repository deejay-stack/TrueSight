"""Download only official tokenizer assets; never download or copy model weights."""
import os
from pathlib import Path

os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parents[1] / ".cache" / "huggingface"))
from transformers import AutoTokenizer, RobertaTokenizer

AutoTokenizer.from_pretrained("microsoft/deberta-v3-base")
RobertaTokenizer.from_pretrained("Salesforce/codet5-small")
print("Official DeBERTa and CodeT5 tokenizers cached.")
