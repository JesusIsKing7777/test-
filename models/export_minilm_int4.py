#!/usr/bin/env python3
"""
[CONVERGE] Dual-target NLI exporter with explicit CoreMLLogitsWrapper:
1. minilm_l6_v2_int4.onnx (Android/Termux ORT)
2. MiniLML6NLI.mlpackage (iOS 17 ANE via coremltools, named "logits")
3. tokenizer.json, vocab.txt, and label_map.json
"""
import argparse, json, os, shutil

def export_coreml(pt_model, seq_len: int, out_dir: str):
    try:
        import coremltools as ct
        import torch
    except Exception:
        return {"coremlStatus": "SKIPPED_COREMLTOOLS_NOT_INSTALLED"}

    class CoreMLLogitsWrapper(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, input_ids, attention_mask):
            out = self.m(input_ids=input_ids, attention_mask=attention_mask, return_dict=True)
            return out.logits if hasattr(out, "logits") else out[0]

    pt_model.eval()
    wrapped = CoreMLLogitsWrapper(pt_model).eval()
    ex_ids = torch.zeros((1, seq_len), dtype=torch.int32)
    ex_mask = torch.ones((1, seq_len), dtype=torch.int32)
    with torch.no_grad():
        traced = torch.jit.trace(wrapped, (ex_ids, ex_mask), strict=False)

    mlmodel = ct.convert(
        traced,
        convert_to="mlprogram",
        minimum_deployment_target=ct.target.iOS17,
        inputs=[
            ct.TensorType(name="input_ids", shape=(1, seq_len), dtype=int),
            ct.TensorType(name="attention_mask", shape=(1, seq_len), dtype=int),
        ],
        outputs=[ct.TensorType(name="logits")],
    )
    quant_mode = "FP16_MLPROGRAM"
    try:
        import coremltools.optimize.coreml as cto
        op_cfg = cto.OpPalettizerConfig(mode="kmeans", nbits=4, weight_threshold=512)
        mlmodel = cto.palettize_weights(mlmodel, cto.OptimizationConfig(global_config=op_cfg))
        quant_mode = "INT4_PALETTIZED_MLPROGRAM"
    except Exception:
        pass

    pkg_path = os.path.join(out_dir, "MiniLML6NLI.mlpackage")
    mlmodel.save(pkg_path)
    return {"coremlStatus": "EXPORTED", "coremlPath": pkg_path, "coremlQuant": quant_mode, "outputFeature": "logits"}

def export_and_quantize(model_id: str, out_dir: str, seq_len: int, with_coreml: bool):
    from transformers import AutoConfig, AutoModelForSequenceClassification, AutoTokenizer
    from optimum.onnxruntime import ORTModelForSequenceClassification
    import onnxruntime as ort

    os.makedirs(out_dir, exist_ok=True)
    fp32_dir = os.path.join(out_dir, "_fp32_tmp")
    cfg = AutoConfig.from_pretrained(model_id)
    tok = AutoTokenizer.from_pretrained(model_id)
    ort_model = ORTModelForSequenceClassification.from_pretrained(model_id, export=True)
    ort_model.save_pretrained(fp32_dir)
    tok.save_pretrained(out_dir)

    fp32_onnx = os.path.join(fp32_dir, "model.onnx")
    int4_onnx = os.path.join(out_dir, "minilm_l6_v2_int4.onnx")
    quant_mode = "INT4_MATMUL_NBITS"
    try:
        from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer
        q = MatMul4BitsQuantizer(model=fp32_onnx, block_size=32, is_symmetric=True)
        q.process()
        q.model.save_model_to_file(int4_onnx, use_external_data_format=False)
    except Exception:
        from onnxruntime.quantization import QuantType, quantize_dynamic
        quant_mode = "INT8_DYNAMIC_FALLBACK"
        quantize_dynamic(fp32_onnx, int4_onnx, weight_type=QuantType.QInt8)

    coreml_meta = {"coremlStatus": "SKIPPED_BY_FLAG"}
    if with_coreml:
        pt_model = AutoModelForSequenceClassification.from_pretrained(model_id)
        coreml_meta = export_coreml(pt_model, seq_len, out_dir)

    with open(os.path.join(out_dir, "label_map.json"), "w", encoding="utf-8") as f:
        json.dump({"model_id": model_id, "quant_mode": quant_mode, "id2label": cfg.id2label, **coreml_meta}, f, indent=2)

    shutil.rmtree(fp32_dir, ignore_errors=True)
    sess = ort.InferenceSession(int4_onnx, providers=["CPUExecutionProvider"])
    print(json.dumps({"onnx": int4_onnx, "bytes": os.path.getsize(int4_onnx), "quant_mode": quant_mode, "inputs": [i.name for i in sess.get_inputs()], **coreml_meta}, indent=2))

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--model-id", default="cross-encoder/nli-MiniLM2-L6-H768")
    p.add_argument("--out-dir", default=os.path.dirname(os.path.abspath(__file__)))
    p.add_argument("--seq-len", type=int, default=128)
    p.add_argument("--no-coreml", action="store_true")
    a = p.parse_args()
    export_and_quantize(a.model_id, a.out_dir, a.seq_len, not a.no_coreml)
