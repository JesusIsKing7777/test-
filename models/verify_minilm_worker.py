#!/usr/bin/env python3
import importlib.util, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "models")
CLASSIFIER = os.path.join(ROOT, "semantic_router_classifier.py")
EXPORTER = os.path.join(MODELS_DIR, "export_minilm_int4.py")

deps = ["torch", "transformers", "optimum", "onnxruntime", "tokenizers"]
missing = [d for d in deps if importlib.util.find_spec(d) is None]
print(json.dumps({"exportDependenciesPresent": len(missing) == 0, "missingPackages": missing}))

if not missing:
    subprocess.check_call([sys.executable, EXPORTER, "--out-dir", MODELS_DIR])
    for req in ("minilm_l6_v2_int4.onnx", "tokenizer.json", "vocab.txt", "label_map.json"):
        assert os.path.exists(os.path.join(MODELS_DIR, req)), f"Missing exported artifact: {req}"
    print("[OK] Real INT4 ONNX export and tokenizer artifacts verified.")
else:
    print("[INFO] Run export_minilm_int4.py on desktop/Colab to generate .onnx + vocab.txt, then copy into ~/alpha/models/.")

with tempfile.TemporaryDirectory() as tmp:
    lbl_path = os.path.join(tmp, "label_map.json")
    with open(lbl_path, "w", encoding="utf-8") as f:
        json.dump({"id2label": {"0": "contradiction", "1": "entailment", "2": "neutral"}}, f)

    proc = subprocess.Popen(
        [sys.executable, CLASSIFIER, "--worker"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    req = {
        "id": 42,
        "text": "Spawning 500 child_process workers is unsafe on 4GB LMKD.",
        "domainRiskFlags": ["HIGH_STAKES_SECURITY"],
        "pillRiskBoost": 0.45,
        "labelMapPath": lbl_path
    }
    out, err = proc.communicate(json.dumps(req) + "\n", timeout=10)
    assert proc.returncode == 0, f"Worker failed: {err}"
    resp = json.loads(out.strip())
    assert resp["ok"] is True and resp["id"] == 42
    res = resp["result"]
    assert res["labelIndices"] == [0, 2, 1], f"Unexpected mapping: {res['labelIndices']}"
    assert res["nliExecuted"] is True and res["vetoTripped"] is True
    print("[OK] --worker stdio protocol + swapped label_map.json [0, 2, 1] verified:", res["inferenceBackend"])
