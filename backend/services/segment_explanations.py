"""Independent, bounded passage inference using the already-loaded text detector.

These scores are supporting evidence only. They never feed the document decision.
"""
import math
import time
from text_explanations import sentence_spans, utf16_offset

MAX_SEGMENTS = 24
BATCH_SIZE = 2
MAX_SEGMENT_TOKENS = 2048
MAX_SECONDS = 12


def explain_segments(detector, text):
    # Cover the beginning of the extracted text; unassessed content remains visible.
    spans = [(start, end) for start, end in sentence_spans(text)
             if len(text[start:end].strip()) >= 12 and sum(character.isalpha() for character in text[start:end]) >= 8]
    selected = spans[:MAX_SEGMENTS]
    segments = []
    tokens_used = 0
    started = time.monotonic()
    processing_limit_reached = False
    torch = detector.torch
    with torch.inference_mode():
        for index in range(0, len(selected), BATCH_SIZE):
            if tokens_used >= MAX_SEGMENT_TOKENS or time.monotonic() - started >= MAX_SECONDS:
                processing_limit_reached = True
                break
            batch_spans = selected[index:index + BATCH_SIZE]
            batch_text = [text[start:end] for start, end in batch_spans]
            inputs = detector.tokenizer(batch_text, truncation=True, max_length=512,
                                        padding=True, return_tensors="pt", return_offsets_mapping=True)
            offsets = inputs.pop("offset_mapping").tolist()
            counts = inputs["attention_mask"].sum(dim=1).tolist()
            count = 0
            for token_count in counts:
                if tokens_used + token_count > MAX_SEGMENT_TOKENS:
                    processing_limit_reached = True
                    break
                tokens_used += token_count
                count += 1
            if not count:
                break
            inputs = {key: value[:count] for key, value in inputs.items()}
            batch_spans, offsets = batch_spans[:count], offsets[:count]
            inputs = {key: value.to(detector.device) for key, value in inputs.items()}
            scores = torch.softmax(detector.model(**inputs).logits, dim=-1).cpu().tolist()
            for row, ((start, end), probabilities) in enumerate(zip(batch_spans, scores)):
                human, ai = probabilities
                if not all(math.isfinite(p) and 0 <= p <= 1 for p in (human, ai)):
                    raise ValueError("Invalid segment probability")
                evaluated_end = max((right for left, right in offsets[row]), default=0)
                # Do not color text the segment model never evaluated.
                scored_end = start + evaluated_end
                if scored_end <= start:
                    continue
                segments.append({
                    "segmentNumber": len(segments) + 1,
                    "start": utf16_offset(text, start), "end": utf16_offset(text, scored_end),
                    "text": text[start:scored_end], "aiProbability": ai, "humanProbability": human,
                    "evaluatedTokens": int(inputs["attention_mask"][row].sum().item()),
                    "truncated": bool(text[scored_end:end].strip()),
                })
    return {
        "status": "completed", "method": "independent_sentence_probability", "version": 1,
        "analyzedText": text, "segments": segments,
        "evaluatedSegments": len(segments), "availableSegments": len(spans),
        "segmentLimit": MAX_SEGMENTS, "maxTokensPerSegment": 512,
        "processingLimitReached": processing_limit_reached,
        "tokenBudget": MAX_SEGMENT_TOKENS, "timeBudgetSeconds": MAX_SECONDS,
        "modelName": "DeBERTa-v3-base V3",
        "limitations": [
            "Each meaningful sentence is scored independently by the same trained text detector. Sentence scores can differ from the document score because context changes.",
            "The first 24 meaningful sentences are assessed, with up to 512 tokens per sentence. Unhighlighted content is not assessed in this view.",
            "Additional sentence work has a 2,048-token budget and a 12-second budget checked between batches. Coverage may stop earlier on long documents.",
            "Short or isolated passages may be less reliable than the original document. Scores are model indicators, not proof of authorship or misconduct.",
            "The original whole-document inference and frozen threshold alone determine the final classification. Sentence scores are never averaged into it.",
        ],
    }
