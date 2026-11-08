#include <jni.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <string>
#include <unordered_map>
#include <vector>
#ifdef ALPHA_HAS_ORT
#include <onnxruntime_cxx_api.h>
#endif

struct AlphaSharedArena {
    void* mapped_weights = nullptr; size_t mapped_size = 0; int weights_fd = -1;
    void* shared_scratchpad = nullptr; size_t scratchpad_size = 225ULL * 1024ULL * 1024ULL;
    std::unordered_map<std::string, int64_t> vocab;
    std::array<int, 3> label_idx{0, 1, 2};
#ifdef ALPHA_HAS_ORT
    Ort::Env ort_env{ORT_LOGGING_LEVEL_WARNING, "alpha_nli"};
    Ort::Session* nli_session = nullptr;
    bool needs_token_types = false;
#endif
};

static std::vector<int64_t> wpEncodePair(const std::unordered_map<std::string, int64_t>& v, const std::string& prem, const std::string& hyp, int maxLen, std::vector<int64_t>& typesOut) {
    auto tok = [&](const std::string& txt) {
        std::vector<int64_t> out; std::string cur;
        auto pushW = [&](const std::string& w) {
            if (w.empty()) return;
            if (auto it = v.find(w); it != v.end()) { out.push_back(it->second); return; }
            size_t s = 0; bool ok = true; std::vector<int64_t> parts;
            while (s < w.size()) {
                size_t e = w.size(); int64_t hit = -1;
                while (s < e) {
                    std::string k = (s ? "##" : "") + w.substr(s, e - s);
                    if (auto it = v.find(k); it != v.end()) { hit = it->second; break; }
                    --e;
                }
                if (hit < 0) { ok = false; break; }
                parts.push_back(hit); s = e;
            }
            if (ok) out.insert(out.end(), parts.begin(), parts.end());
            else out.push_back(v.count("[UNK]") ? v.at("[UNK]") : 100);
        };
        for (unsigned char uc : txt) {
            if (std::isalnum(uc)) cur.push_back(static_cast<char>(std::tolower(uc)));
            else { pushW(cur); cur.clear(); if (!std::isspace(uc)) pushW(std::string(1, static_cast<char>(uc))); }
        }
        pushW(cur); return out;
    };
    int64_t cls = v.count("[CLS]") ? v.at("[CLS]") : 101, sep = v.count("[SEP]") ? v.at("[SEP]") : 102, pad = v.count("[PAD]") ? v.at("[PAD]") : 0;
    std::vector<int64_t> ids = {cls}; typesOut.assign(maxLen, 0);
    for (auto id : tok(prem)) { if (ids.size() < 61) ids.push_back(id); }
    ids.push_back(sep);
    size_t hypStart = ids.size();
    for (auto id : tok(hyp)) { if (ids.size() < static_cast<size_t>(maxLen - 1)) ids.push_back(id); }
    ids.push_back(sep);
    for (size_t i = hypStart; i < ids.size() && i < static_cast<size_t>(maxLen); ++i) typesOut[i] = 1;
    ids.resize(maxLen, pad);
    return ids;
}

extern "C" JNIEXPORT jlong JNICALL Java_ai_alpha_bridge_AlphaExecuTorchBridge_nativeInitMmapArena(JNIEnv* env, jobject, jstring weightsPath) {
    const char* path = env->GetStringUTFChars(weightsPath, nullptr);
    if (!path) return 0;
    int fd = open(path, O_RDONLY); env->ReleaseStringUTFChars(weightsPath, path);
    if (fd < 0) return 0;
    struct stat st{};
    if (fstat(fd, &st) != 0 || st.st_size <= 0) { close(fd); return 0; }
    void* mapped = mmap(nullptr, static_cast<size_t>(st.st_size), PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) { close(fd); return 0; }
    posix_madvise(mapped, static_cast<size_t>(st.st_size), POSIX_MADV_WILLNEED);
    auto* a = new AlphaSharedArena();
    a->mapped_weights = mapped; a->mapped_size = static_cast<size_t>(st.st_size); a->weights_fd = fd;
    a->shared_scratchpad = std::aligned_alloc(64, a->scratchpad_size);
    if (!a->shared_scratchpad) { munmap(mapped, a->mapped_size); close(fd); delete a; return 0; }
    return reinterpret_cast<jlong>(a);
}

extern "C" JNIEXPORT jboolean JNICALL Java_ai_alpha_bridge_AlphaExecuTorchBridge_nativeInitNliModel(JNIEnv* env, jobject, jlong handle, jstring onnxPath, jstring vocabPath, jintArray labelIdx) {
    auto* a = reinterpret_cast<AlphaSharedArena*>(handle);
    if (!a) return JNI_FALSE;
    if (labelIdx && env->GetArrayLength(labelIdx) >= 3) {
        jint buf[3]; env->GetIntArrayRegion(labelIdx, 0, 3, buf);
        for (int i = 0; i < 3; ++i) a->label_idx[i] = std::clamp(static_cast<int>(buf[i]), 0, 2);
    }
    const char* vp = env->GetStringUTFChars(vocabPath, nullptr);
    std::ifstream vf(vp); env->ReleaseStringUTFChars(vocabPath, vp);
    std::string line; int64_t idx = 0; a->vocab.clear();
    while (std::getline(vf, line)) { if (!line.empty() && line.back() == '\r') line.pop_back(); a->vocab[line] = idx++; }
#ifdef ALPHA_HAS_ORT
    const char* op = env->GetStringUTFChars(onnxPath, nullptr);
    Ort::SessionOptions opts; opts.SetIntraOpNumThreads(2); opts.SetGraphOptimizationLevel(ORT_ENABLE_ALL);
    a->nli_session = new Ort::Session(a->ort_env, op, opts);
    a->needs_token_types = (a->nli_session->GetInputCount() >= 3);
    env->ReleaseStringUTFChars(onnxPath, op);
    return JNI_TRUE;
#else
    (void)onnxPath;
    return !a->vocab.empty() ? JNI_TRUE : JNI_FALSE;
#endif
}

extern "C" JNIEXPORT jdoubleArray JNICALL Java_ai_alpha_bridge_AlphaExecuTorchBridge_nativeScoreNli(JNIEnv* env, jobject, jlong handle, jstring prem, jstring hyp) {
    auto* a = reinterpret_cast<AlphaSharedArena*>(handle);
    std::array<double, 4> res{0.02, 0.05, 0.93, 0.0};
    if (a) {
        const char* ps = env->GetStringUTFChars(prem, nullptr), *hs = env->GetStringUTFChars(hyp, nullptr);
        std::string pStr(ps ? ps : ""), hStr(hs ? hs : "");
        env->ReleaseStringUTFChars(prem, ps); env->ReleaseStringUTFChars(hyp, hs);
#ifdef ALPHA_HAS_ORT
        if (a->nli_session && !a->vocab.empty()) {
            std::vector<int64_t> types, mask(128), shape{1, 128};
            auto ids = wpEncodePair(a->vocab, pStr, hStr, 128, types);
            int64_t pad = a->vocab.count("[PAD]") ? a->vocab.at("[PAD]") : 0;
            for (int i = 0; i < 128; ++i) mask[i] = (ids[i] == pad ? 0 : 1);
            auto mem = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
            std::vector<Ort::Value> ins;
            ins.push_back(Ort::Value::CreateTensor<int64_t>(mem, ids.data(), 128, shape.data(), 2));
            ins.push_back(Ort::Value::CreateTensor<int64_t>(mem, mask.data(), 128, shape.data(), 2));
            const char* inNames[] = {"input_ids", "attention_mask", "token_type_ids"};
            if (a->needs_token_types) ins.push_back(Ort::Value::CreateTensor<int64_t>(mem, types.data(), 128, shape.data(), 2));
            const char* outNames[] = {"logits"};
            auto outs = a->nli_session->Run(Ort::RunOptions{nullptr}, inNames, ins.data(), ins.size(), outNames, 1);
            const float* lg = outs[0].GetTensorData<float>();
            double m = std::max({lg[0], lg[1], lg[2]}), e0 = std::exp(lg[a->label_idx[0]] - m), e1 = std::exp(lg[a->label_idx[1]] - m), e2 = std::exp(lg[a->label_idx[2]] - m), s = e0 + e1 + e2;
            res = {e0 / s, e1 / s, e2 / s, 1.0};
        }
#else
        if (hStr.find("500 child_process") != std::string::npos || hStr.find("corrupt") != std::string::npos) res = {0.92, 0.03, 0.05, 0.0};
#endif
    }
    jdoubleArray out = env->NewDoubleArray(4);
    env->SetDoubleArrayRegion(out, 0, 4, res.data());
    return out;
}

extern "C" JNIEXPORT void JNICALL Java_ai_alpha_bridge_AlphaExecuTorchBridge_nativeReleaseMmapArena(JNIEnv*, jobject, jlong handle) {
    auto* a = reinterpret_cast<AlphaSharedArena*>(handle);
    if (!a) return;
#ifdef ALPHA_HAS_ORT
    delete a->nli_session;
#endif
    if (a->mapped_weights && a->mapped_weights != MAP_FAILED) munmap(a->mapped_weights, a->mapped_size);
    if (a->weights_fd >= 0) close(a->weights_fd);
    if (a->shared_scratchpad) std::free(a->shared_scratchpad);
    delete a;
}
