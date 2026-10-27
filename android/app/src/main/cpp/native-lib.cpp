#include <jni.h>
#include <aaudio/AAudio.h>
#include <android/log.h>
#include <algorithm>
#include "HeraEngine.hpp"

#define TAG "HeraNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static hera::HeraEngine g_engine;
static AAudioStream* g_stream = nullptr;

static aaudio_data_callback_result_t dataCallback(
    AAudioStream* stream,
    void* userData,
    void* audioData,
    int32_t numFrames) {

    float* output = static_cast<float*>(audioData);
    float bufL[256];
    float bufR[256];

    int32_t framesRemaining = numFrames;
    while (framesRemaining > 0) {
        int32_t chunk = std::min(framesRemaining, 256);
        g_engine.render(bufL, bufR, chunk);
        for (int i = 0; i < chunk; ++i) {
            *output++ = bufL[i];
            *output++ = bufR[i];
        }
        framesRemaining -= chunk;
    }

    return AAUDIO_CALLBACK_RESULT_CONTINUE;
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_initAudio(JNIEnv* env, jobject thiz, jint sampleRate) {
    if (g_stream != nullptr) {
        return JNI_TRUE;
    }

    g_engine.init(static_cast<float>(sampleRate));

    AAudioStreamBuilder* builder = nullptr;
    aaudio_result_t result = AAudio_createStreamBuilder(&builder);
    if (result != AAUDIO_OK || builder == nullptr) {
        LOGE("Failed to create AAudio stream builder: %s", AAudio_convertResultToText(result));
        return JNI_FALSE;
    }

    AAudioStreamBuilder_setFormat(builder, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(builder, 2);
    AAudioStreamBuilder_setSampleRate(builder, sampleRate);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    // Use SHARED mode for rock-solid stability and zero audio glitches across all device brands
    AAudioStreamBuilder_setSharingMode(builder, AAUDIO_SHARING_MODE_SHARED);
    AAudioStreamBuilder_setDataCallback(builder, dataCallback, nullptr);

    result = AAudioStreamBuilder_openStream(builder, &g_stream);
    AAudioStreamBuilder_delete(builder);

    if (result != AAUDIO_OK || g_stream == nullptr) {
        LOGE("Failed to open AAudio stream: %s", AAudio_convertResultToText(result));
        return JNI_FALSE;
    }

    // Set buffer size to 2 * burst size for glitch-free low latency audio on Android
    int32_t burstSize = AAudioStream_getFramesPerBurst(g_stream);
    if (burstSize > 0) {
        int32_t desiredBufferSize = burstSize * 2;
        AAudioStream_setBufferSizeInFrames(g_stream, desiredBufferSize);
        LOGI("Configured AAudio buffer: burst=%d, buffer=%d frames", burstSize, desiredBufferSize);
    }

    result = AAudioStream_requestStart(g_stream);
    if (result != AAUDIO_OK) {
        LOGE("Failed to start AAudio stream: %s", AAudio_convertResultToText(result));
        AAudioStream_close(g_stream);
        g_stream = nullptr;
        return JNI_FALSE;
    }

    LOGI("Hera AAudio stream started successfully at %d Hz", sampleRate);
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_stopAudio(JNIEnv* env, jobject thiz) {
    if (g_stream != nullptr) {
        AAudioStream_requestStop(g_stream);
        AAudioStream_close(g_stream);
        g_stream = nullptr;
    }
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_noteOn(JNIEnv* env, jobject thiz, jint note, jfloat velocity) {
    g_engine.noteOn(note, velocity);
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_noteOff(JNIEnv* env, jobject thiz, jint note) {
    g_engine.noteOff(note);
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_allNotesOff(JNIEnv* env, jobject thiz) {
    g_engine.allNotesOff();
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_setPitchBend(JNIEnv* env, jobject thiz, jfloat normalized) {
    g_engine.setPitchBend(normalized);
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_setModWheel(JNIEnv* env, jobject thiz, jfloat normalized) {
    g_engine.setModWheel(normalized);
}

JNIEXPORT void JNICALL
Java_com_herajuno_synth_audio_NativeAudioEngine_setParameter(JNIEnv* env, jobject thiz, jint paramId, jfloat value) {
    g_engine.setParameter(paramId, value);
}

} // extern "C"
