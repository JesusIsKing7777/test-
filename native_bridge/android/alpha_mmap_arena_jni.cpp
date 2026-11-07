// [CONVERGE 1a] POSIX mmap Shared-Arena JNI Implementation for Android ExecuTorch
#include <jni.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>

struct AlphaSharedArena {
    void* mapped_weights = nullptr;
    size_t mapped_size = 0;
    int weights_fd = -1;
    void* shared_scratchpad = nullptr;
    size_t scratchpad_size = 225ULL * 1024ULL * 1024ULL; // 180MB KV/Scratch + 45MB MiniLM INT4
};

extern "C" JNIEXPORT jlong JNICALL
Java_ai_alpha_bridge_AlphaExecuTorchBridge_nativeInitMmapArena(
    JNIEnv* env, jobject /* thiz */, jstring weightsPath) {
    const char* path = env->GetStringUTFChars(weightsPath, nullptr);
    if (!path) return 0;

    int fd = open(path, O_RDONLY);
    env->ReleaseStringUTFChars(weightsPath, path);
    if (fd < 0) return 0;

    struct stat st{};
    if (fstat(fd, &st) != 0 || st.st_size <= 0) {
        close(fd);
        return 0;
    }

    void* mapped = mmap(nullptr, static_cast<size_t>(st.st_size), PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        close(fd);
        return 0;
    }
    posix_madvise(mapped, static_cast<size_t>(st.st_size), POSIX_MADV_WILLNEED);

    auto* arena = new AlphaSharedArena();
    arena->mapped_weights = mapped;
    arena->mapped_size = static_cast<size_t>(st.st_size);
    arena->weights_fd = fd;
    arena->shared_scratchpad = std::aligned_alloc(64, arena->scratchpad_size);
    if (!arena->shared_scratchpad) {
        munmap(mapped, arena->mapped_size);
        close(fd);
        delete arena;
        return 0;
    }
    return reinterpret_cast<jlong>(arena);
}

extern "C" JNIEXPORT void JNICALL
Java_ai_alpha_bridge_AlphaExecuTorchBridge_nativeReleaseMmapArena(
    JNIEnv* /* env */, jobject /* thiz */, jlong handle) {
    auto* arena = reinterpret_cast<AlphaSharedArena*>(handle);
    if (!arena) return;
    if (arena->mapped_weights && arena->mapped_weights != MAP_FAILED) {
        munmap(arena->mapped_weights, arena->mapped_size);
    }
    if (arena->weights_fd >= 0) close(arena->weights_fd);
    if (arena->shared_scratchpad) std::free(arena->shared_scratchpad);
    delete arena;
}
