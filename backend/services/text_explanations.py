"""Bounded sentence occlusion of the classifier's actual tokenized context."""
import re
import math

MAX_PASSAGES = 16


def utf16_offset(text, index):
    # Browser string offsets use UTF-16, including two code units for emoji.
    return len(text[:index].encode("utf-16-le")) // 2


def sentence_spans(text):
    for match in re.finditer(r"\S[\s\S]*?(?:[.!?]+(?=\s|$)|\n+|$)", text):
        start, end = match.span()
        while end > start and text[end - 1].isspace():
            end -= 1
        if end > start:
            yield start, end


def explain_text(detector, text, inputs, offsets, baseline):
    torch = detector.torch
    if detector.tokenizer.mask_token_id is None:
        raise ValueError("Tokenizer has no mask token")
    evaluated_end = max((end for start, end in offsets), default=0)
    excerpt = text[:evaluated_end]
    passages = []
    for start, end in sentence_spans(excerpt):
        positions = [i for i, (left, right) in enumerate(offsets) if right > left and left < end and right > start]
        if positions:
            passages.append((start, end, positions))
    selected = passages[:MAX_PASSAGES]
    results = []
    # Small batches bound CPU/GPU activation memory; loaded model is reused.
    with torch.inference_mode():
        for index in range(0, len(selected), 2):
            batch_passages = selected[index:index + 2]
            batch = {key: value.repeat(len(batch_passages), 1) for key, value in inputs.items()}
            for row, (_, _, positions) in enumerate(batch_passages):
                batch["input_ids"][row, positions] = detector.tokenizer.mask_token_id
            scores = torch.softmax(detector.model(**batch).logits, dim=-1)[:, 1].cpu().tolist()
            for (start, end, _), score in zip(batch_passages, scores):
                if not math.isfinite(score) or not 0 <= score <= 1:
                    raise ValueError("Invalid masked probability")
                results.append({
                    "sentenceNumber": len(results) + 1,
                    "start": utf16_offset(excerpt, start),
                    "end": utf16_offset(excerpt, end),
                    "text": excerpt[start:end],
                    "maskedAiProbability": score,
                    "impactPercentagePoints": (baseline - score) * 100,
                })
    return {
        "status": "completed", "method": "sentence_occlusion", "version": 2,
        "baselineAiProbability": baseline,
        "analyzedText": excerpt, "sentences": results,
        "evaluatedTokens": int(inputs["attention_mask"].sum().item()),
        "maxTokens": 512, "truncated": bool(text[evaluated_end:].strip()),
        "evaluatedSentences": len(results), "availableSentences": len(passages),
        "sentenceLimit": MAX_PASSAGES,
        "summary": "Each passage is masked in the original tokenized context and the same model is run again. A positive impact means its presence supported a higher AI score; a negative impact means it lowered that score.",
        "limitations": [
            "These are model sensitivity measurements, not sentence-level AI probabilities or proof of authorship.",
            "Masking changes the input context. Passage effects interact and do not add up to the document score.",
            "The document decision uses only the original inference and frozen threshold. Highlight colors do not change that decision.",
        ],
    }
