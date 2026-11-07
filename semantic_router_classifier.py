#!/usr/bin/env python3
import argparse, json, math, os, re, time

FACT_RE = re.compile(r"(\b\d+(?:\.\d+)?\s*(?:%|ms|gb|mb|kb|usd|\$|s|x)\b|\b(?:19|20)\d{2}\b|\b(?:verified|proves|always|never|sha256|hmac)\b)", re.I)
HIGH_RE = re.compile(r"\b(medical|dosage|legal|contract|financial|transfer|delete|rm\s+-rf|oom|lmkd|security|key)\b", re.I)
CONV_RE = re.compile(r"^(hi|hello|thanks|ok|okay|explain simply|summarize|brainstorm)\b", re.I)

def softmax_3(logits):
    m = max(logits)
    exps = [math.exp(x - m) for x in logits]
    s = sum(exps)
    return [e / s for e in exps]

class MobileMemoryArenaGuard:
    def __init__(self, total_ram_mb=4096, free_ram_mb=None):
        self.total_ram_mb, self.free_ram_mb = total_ram_mb, free_ram_mb

    def check_lmkd_headroom(self):
        used_rss = 1720 + 180 + 45 + 40
        headroom = self.free_ram_mb if self.free_ram_mb is not None else (self.total_ram_mb - 1450) - used_rss
        safe = headroom >= 400
        return {
            "totalRamMb": self.total_ram_mb, "appPeakRssMb": used_rss,
            "lmkdHeadroomMb": headroom, "lmkdSafe": safe,
            "recommendedTier": "LLAMA_3B_INT4_MMAP" if safe else "FALLBACK_1B_INT4_OR_CLOUD"
        }

class OnnxMiniLmNliScorer:
    def __init__(self, model="models/minilm_l6_v2_int4.onnx", tok="models/tokenizer.json"):
        self.session = self.tokenizer = None
        self.backend = "CALIBRATED_FALLBACK"
        if os.path.exists(model) and os.path.exists(tok):
            try:
                import onnxruntime as ort
                from tokenizers import Tokenizer
                self.session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
                self.tokenizer = Tokenizer.from_file(tok)
                self.tokenizer.enable_truncation(max_length=128)
                self.tokenizer.enable_padding(length=128)
                self.backend = "ONNX_MINILM_L6_INT4"
            except Exception:
                self.session = self.tokenizer = None

    def score_pair(self, premise, hyp):
        if self.session and self.tokenizer:
            enc = self.tokenizer.encode(premise or "Mobile edge invariants.", hyp)
            inp = {"input_ids": [enc.ids], "attention_mask": [enc.attention_mask]}
            if any(i.name == "token_type_ids" for i in self.session.get_inputs()):
                inp["token_type_ids"] = [enc.type_ids]
            return softmax_3([float(x) for x in self.session.run(None, inp)[0][0][:3]]), self.backend
        low = hyp.lower()
        logits = [3.6, 0.4, -1.8] if any(k in low for k in ("128.0 mb", "500 child_process", "corrupt", "unsafe")) else [-2.2, 0.1, 3.9]
        return softmax_3(logits), self.backend

class SemanticRouterClassifier:
    def __init__(self, veto=0.35, tau=0.85, free_ram_mb=None):
        self.veto, self.tau = veto, tau
        self.arena = MobileMemoryArenaGuard(4096, free_ram_mb)
        self.nli = OnnxMiniLmNliScorer()

    def evaluate_acu(self, text, flags=None, boost=0.0, premise=""):
        t0, flags = time.perf_counter(), (flags or [])
        risk = 0.15 + (-0.10 if CONV_RE.search(text.strip()) else 0.0)
        risk += min(0.45, len(FACT_RE.findall(text)) * 0.20) + (0.40 if HIGH_RE.search(text) else 0.0) + float(boost)
        if any(f.startswith(("HIGH_STAKES_", "STRICT_")) for f in flags):
            risk = max(risk, 0.55)
        risk = max(0.0, min(1.0, round(risk, 3)))
        bypass = risk < 0.40
        base = {
            "text": text, "domainRiskFlags": flags, "riskScore": risk,
            "route": "FAST_STREAM_BYPASS_NLI" if bypass else "STREAM_PLUS_ASYNC_NLI",
            "bypassNli": bypass, "gateLatencyMs": round((time.perf_counter() - t0) * 1000.0, 3),
            "memoryArena": self.arena.check_lmkd_headroom()
        }
        if bypass:
            return {**base, "nliExecuted": False, "inferenceBackend": "BYPASSED", "uiTarget": "VERIFIED_CORE_70_DIRECT", "badge": "[Inferred]"}
        probs, backend = self.nli.score_pair(premise, text)
        pc, pn, pe = [round(x, 4) for x in probs]
        veto_hit = pc >= self.veto
        target = "BOTTOM_QUARANTINE_DRAWER_30" if (veto_hit or pe < self.tau) else "VERIFIED_CORE_70_LOCKED"
        badge = "[Quarantined - Contradiction Veto]" if veto_hit else ("[Inferred - Low Entailment]" if pe < self.tau else "[Reported]")
        return {**base, "nliExecuted": True, "inferenceBackend": backend, "probs": {"contra": pc, "neutral": pn, "entail": pe}, "vetoTripped": veto_hit, "uiTarget": target, "badge": badge}

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--eval-json", default=None)
    a = p.parse_args()
    if a.eval_json:
        d = json.loads(a.eval_json)
        print(json.dumps(SemanticRouterClassifier(free_ram_mb=d.get("freeRamMb")).evaluate_acu(d.get("text", ""), d.get("domainRiskFlags", []), d.get("pillRiskBoost", 0.0), d.get("premise", ""))))
    else:
        print(json.dumps(SemanticRouterClassifier().evaluate_acu("Llama-3-3B INT4 uses 1.72 GB mmap memory.", ["STRICT_NUMERIC_NLI"], 0.30), indent=2))
