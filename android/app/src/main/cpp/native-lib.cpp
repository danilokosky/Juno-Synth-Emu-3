#include <jni.h>
#include <aaudio/AAudio.h>
#include <android/log.h>
#include <cstring>
#include <memory>
#include <atomic>
#include "HeraEngine.hpp"

#define LOG_TAG "HeraNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

std::unique_ptr<hera::HeraEngine> gEngine;
AAudioStream* gStream = nullptr;
std::atomic<bool> gIsRunning{false};

aaudio_data_callback_result_t dataCallback(
    AAudioStream* stream,
    void* userData,
    void* audioData,
    int32_t numFrames
) {
    auto* engine = static_cast<hera::HeraEngine*>(userData);
    auto* outBuffer = static_cast<float*>(audioData);

    if (!engine || !gIsRunning.load(std::memory_order_relaxed)) {
        std::memset(outBuffer, 0, sizeof(float) * numFrames * 2);
        return AAUDIO_CALLBACK_RESULT_CONTINUE;
    }

    engine->renderStereo(outBuffer, numFrames);
    return AAUDIO_CALLBACK_RESULT_CONTINUE;
}

void closeStream() {
    gIsRunning.store(false);
    if (gStream != nullptr) {
        AAudioStream_requestStop(gStream);
        AAudioStream_close(gStream);
        gStream = nullptr;
    }
}

bool openAndStartStream();

void errorCallback(
    AAudioStream* stream,
    void* userData,
    aaudio_result_t error
) {
    LOGE("AAudio stream error: %s. Restarting stream...", AAudio_convertResultToText(error));
    if (error == AAUDIO_ERROR_DISCONNECTED) {
        closeStream();
        openAndStartStream();
    }
}

bool openAndStartStream() {
    if (!gEngine) {
        gEngine = std::make_unique<hera::HeraEngine>();
    }

    AAudioStreamBuilder* builder = nullptr;
    aaudio_result_t result = AAudio_createStreamBuilder(&builder);
    if (result != AAUDIO_OK || !builder) {
        LOGE("Failed to create AAudioStreamBuilder: %s", AAudio_convertResultToText(result));
        return false;
    }

    AAudioStreamBuilder_setDirection(builder, AAUDIO_DIRECTION_OUTPUT);
    AAudioStreamBuilder_setSharingMode(builder, AAUDIO_SHARING_MODE_SHARED);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setFormat(builder, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(builder, 2);
#if __ANDROID_API__ >= 28
    AAudioStreamBuilder_setUsage(builder, AAUDIO_USAGE_MEDIA);
#endif
    AAudioStreamBuilder_setDataCallback(builder, dataCallback, gEngine.get());
    AAudioStreamBuilder_setErrorCallback(builder, errorCallback, gEngine.get());

    result = AAudioStreamBuilder_openStream(builder, &gStream);
    AAudioStreamBuilder_delete(builder);

    if (result != AAUDIO_OK || !gStream) {
        LOGE("Failed to open AAudioStream: %s", AAudio_convertResultToText(result));
        gStream = nullptr;
        return false;
    }

    int32_t sampleRate = AAudioStream_getSampleRate(gStream);
    if (sampleRate <= 0) sampleRate = 48000;
    gEngine->setSampleRate(static_cast<float>(sampleRate));

    int32_t burstFrames = AAudioStream_getFramesPerBurst(gStream);
    if (burstFrames > 0) {
        AAudioStream_setBufferSizeInFrames(gStream, burstFrames * 2);
    }

    gIsRunning.store(true);
    result = AAudioStream_requestStart(gStream);
    if (result != AAUDIO_OK) {
        LOGE("Failed to start AAudioStream: %s", AAudio_convertResultToText(result));
        closeStream();
        return false;
    }

    LOGI("Hera AAudio Engine started at %d Hz (burst: %d frames)", sampleRate, burstFrames);
    return true;
}

} // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_hera_juno_NativeSynthBridge_initEngine(JNIEnv* env, jobject /* this */) {
    closeStream();
    return openAndStartStream() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_stopEngine(JNIEnv* env, jobject /* this */) {
    closeStream();
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_noteOn(JNIEnv* env, jobject /* this */, jint note, jfloat velocity) {
    if (gEngine) {
        gEngine->noteOn(static_cast<int>(note), static_cast<float>(velocity));
    }
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_noteOff(JNIEnv* env, jobject /* this */, jint note) {
    if (gEngine) {
        gEngine->noteOff(static_cast<int>(note));
    }
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_allNotesOff(JNIEnv* env, jobject /* this */) {
    if (gEngine) {
        gEngine->allNotesOff();
    }
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_setParameter(JNIEnv* env, jobject /* this */, jint paramId, jfloat value) {
    if (gEngine) {
        gEngine->setParameter(static_cast<int>(paramId), static_cast<float>(value));
    }
}

JNIEXPORT jfloat JNICALL
Java_com_hera_juno_NativeSynthBridge_getParameter(JNIEnv* env, jobject /* this */, jint paramId) {
    if (gEngine) {
        return gEngine->getParameter(static_cast<int>(paramId));
    }
    return 0.0f;
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_setPitchBend(JNIEnv* env, jobject /* this */, jfloat bend, jfloat modWheel) {
    if (gEngine) {
        gEngine->setPitchBend(static_cast<float>(bend), static_cast<float>(modWheel));
    }
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_setArpConfig(
    JNIEnv* env,
    jobject /* this */,
    jboolean enabled,
    jint mode,
    jint range,
    jfloat bpm,
    jint rateDiv
) {
    if (gEngine) {
        gEngine->setArpConfig(
            enabled == JNI_TRUE,
            static_cast<int>(mode),
            static_cast<int>(range),
            static_cast<float>(bpm),
            static_cast<int>(rateDiv)
        );
    }
}

JNIEXPORT jint JNICALL
Java_com_hera_juno_NativeSynthBridge_getActiveVoicesCount(JNIEnv* env, jobject /* this */) {
    if (gEngine) {
        return static_cast<jint>(gEngine->getActiveVoicesCount());
    }
    return 0;
}

JNIEXPORT void JNICALL
Java_com_hera_juno_NativeSynthBridge_getWaveformBuffer(JNIEnv* env, jobject /* this */, jfloatArray outArray) {
    if (!gEngine || !outArray) return;
    jsize len = env->GetArrayLength(outArray);
    if (len <= 0) return;
    jfloat* ptr = env->GetFloatArrayElements(outArray, nullptr);
    if (ptr) {
        gEngine->copyWaveform(ptr, static_cast<int>(len));
        env->ReleaseFloatArrayElements(outArray, ptr, 0);
    }
}

} // extern "C"
