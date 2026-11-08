#!/usr/bin/env python3
import argparse, json, os, shutil, sys, tempfile
DEFAULT_MODEL = "typeform/distilbert-base-uncased-mnli"

def export_onnx(model_id, out_dir):
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    from optimum.onnxruntime import ORTModelForSequenceClassification
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    tok = AutoTokenizer.from_pretrained(model_id)
    tok.save_pretrained(out_dir)
    vocab_path = os.path.join(out_dir, "vocab.txt")
    if not os.path.exists(vocab_path):
        tok.save_vocabulary(out_dir)
    if not os.path.exists(vocab_path) and os.path.exists(os.path.join(out_dir, "tokenizer.json")):
        tj = json.load(open(os.path.join(out_dir, "tokenizer.json"), encoding="utf-8"))
        vocab_dict = tj.get("model", {}).get("vocab", {})
        if vocab_dict:
            ordered = [k for k, _ in sorted(vocab_dict.items(), key=lambda kv: kv[1])]
            open(vocab_path, "w", encoding="utf-8").write("\n".join(ordered) + "\n")
    assert os.path.exists(vocab_path), "WordPiece vocab.txt could not be generated"

    pt_model = AutoModelForSequenceClassification.from_pretrained(model_id)
    id2l = {str(k): str(v) for k, v in getattr(pt_model.config, "id2label", {}).items()}
    l2id = {str(k): int(v) for k, v in getattr(pt_model.config, "label2id", {}).items()}
    with open(os.path.join(out_dir, "label_map.json"), "w", encoding="utf-8") as f:
        json.dump({"model_id": model_id, "id2label": id2l, "label2id": l2id}, f, indent=2)

    tmp_dir = tempfile.mkdtemp(prefix="ort_fp32_")
    try:
        ort_m = ORTModelForSequenceClassification.from_pretrained(model_id, export=True)
        ort_m.save_pretrained(tmp_dir)
        fp32_onnx = os.path.join(tmp_dir, "model.onnx")
        out_onnx = os.path.join(out_dir, "minilm_l6_v2_int4.onnx")
        quant_mode = "QUINT8_DYNAMIC"
        try:
            from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer
            m = onnx.load(fp32_onnx)
            q = MatMul4BitsQuantizer(m, block_size=32, is_symmetric=True)
            q.process()
            q.model.save_model_to_file(out_onnx, use_external_data_format=False)
            quant_mode = "MATMUL_4BITS"
        except Exception:
            quantize_dynamic(fp32_onnx, out_onnx, weight_type=QuantType.QUInt8)
        return quant_mode
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

def export_coreml(model_id, out_dir):
    try:
        import coremltools as ct, numpy as np, torch
        from transformers import AutoModelForSequenceClassification
    except Exception:
        return "SKIPPED_COREMLTOOLS_NOT_INSTALLED"

    class CoreMLLogitsWrapper(torch.nn.Module):
        def __init__(self, m):
            super().__init__(); self.m = m
        def forward(self, input_ids, attention_mask):
            return self.m(input_ids=input_ids, attention_mask=attention_mask).logits

    pt = AutoModelForSequenceClassification.from_pretrained(model_id).eval()
    wrap = CoreMLLogitsWrapper(pt)
    ids = torch.zeros((1, 128), dtype=torch.int32)
    mask = torch.ones((1, 128), dtype=torch.int32)
    traced = torch.jit.trace(wrap, (ids, mask))
    mlmodel = ct.convert(
        traced,
        inputs=[ct.TensorType(name="input_ids", shape=(1, 128), dtype=np.int32),
                ct.TensorType(name="attention_mask", shape=(1, 128), dtype=np.int32)],
        outputs=[ct.TensorType(name="logits")],
    )
    mlmodel.save(os.path.join(out_dir, "MiniLML6NLI.mlpackage"))
    return "COREML_MLPACKAGE_SAVED"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir", default="models")
    p.add_argument("--model-id", default=DEFAULT_MODEL)
    p.add_argument("--no-coreml", action="store_true")
    args = p.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    qmode = export_onnx(args.model_id, args.out_dir)
    cm = "SKIPPED_COREMLTOOLS_NOT_INSTALLED" if args.no_coreml else export_coreml(args.model_id, args.out_dir)
    print(json.dumps({"onnx": qmode, "coreml": cm, "outDir": args.out_dir}, indent=2))

if __name__ == "__main__":
    main()
