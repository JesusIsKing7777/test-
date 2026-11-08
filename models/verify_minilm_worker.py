#!/usr/bin/env python3
import importlib.util, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "models")
REQ_PKGS = ["torch", "transformers", "optimum", "onnxruntime", "tokenizers"]
missing = [p for p in REQ_PKGS if importlib.util.find_spec(p) is None]
deps_ok = len(missing) == 0
print(json.dumps({"exportDependenciesPresent": deps_ok, "missingPackages": missing}))

onnx_path = os.path.join(MODELS_DIR, "minilm_l6_v2_int4.onnx")
if deps_ok and not os.path.exists(onnx_path):
    subprocess.run([sys.executable, os.path.join(MODELS_DIR, "export_minilm_int4.py"), "--out-dir", MODELS_DIR, "--no-coreml"], check=True)

if deps_ok or os.path.exists(onnx_path):
    for req in ("minilm_l6_v2_int4.onnx", "tokenizer.json", "vocab.txt", "label_map.json"):
        p = os.path.join(MODELS_DIR, req)
        assert os.path.exists(p) and os.path.getsize(p) > 0, f"Missing or empty artifact: {req}"

with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tf:
    json.dump({"id2label": {"0": "CONTRADICTION", "1": "ENTAILMENT", "2": "NEUTRAL"}}, tf)
    swap_path = tf.name

try:
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "semantic_router_classifier.py"), "--worker"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    req = {"id": 1, "text": "Spawning 500 child_process workers is safe on 4GB LMKD.", "domainRiskFlags": ["HIGH_STAKES_SECURITY"], "pillRiskBoost": 0.45, "premise": "Mobile edge invariants.", "labelMapPath": swap_path}
    out, err = proc.communicate(json.dumps(req) + "\n", timeout=15)
    assert proc.returncode == 0, f"Worker failed: {err}"
    msg = json.loads(out.strip().splitlines()[-1])
    assert msg.get("ok"), f"Worker error: {msg}"
    res = msg["result"]
    if "labelIndices" in res:
        assert res["labelIndices"] == [0, 2, 1], f"Bad labelIndices: {res['labelIndices']}"
    if deps_ok and os.path.exists(onnx_path):
        assert res.get("inferenceBackend") == "ONNX_MINILM_L6_INT4", f"Expected ONNX backend, got {res.get('inferenceBackend')}"
    print(json.dumps({"verified": True, "backend": res.get("inferenceBackend"), "vetoTripped": res.get("vetoTripped")}))
finally:
    os.unlink(swap_path)
