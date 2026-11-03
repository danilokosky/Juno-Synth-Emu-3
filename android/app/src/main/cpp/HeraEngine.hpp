#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <vector>
#include <array>
#include <atomic>

namespace hera {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 6.28318530717958647692f;
constexpr int kMaxVoices = 6;
constexpr int kWaveformBufferSize = 512;
constexpr uint32_t kEventQueueSize = 512;
constexpr uint32_t kEventQueueMask = kEventQueueSize - 1;

enum ParamId : int {
    DCORange = 0,          // 0 = 16'(0.5), 1 = 8'(1.0), 2 = 4'(2.0)
    DCOSawLevel = 1,       // 0..1
    DCOPulseLevel = 2,     // 0..1
    DCOSubLevel = 3,       // 0..1
    DCONoiseLevel = 4,     // 0..1
    DCOPWMDepth = 5,       // 0..1
    DCOPWMMod = 6,         // 0 = Manual, 1 = LFO, 2 = Env
    DCOPitchModDepth = 7,  // 0..1
    HPF = 8,               // 0..1
    VCFCutoff = 9,         // 0..1
    VCFResonance = 10,     // 0..1
    VCFEnv = 11,           // 0..1 (or bipolar)
    VCFLFO = 12,           // 0..1
    VCFKey = 13,           // 0..1
    VCFBendDepth = 14,     // 0..1
    VCAType = 15,          // 0 = Env, 1 = Gate
    VCADepth = 16,         // 0..1
    ENVAttack = 17,        // 0..1
    ENVDecay = 18,         // 0..1
    ENVSustain = 19,       // 0..1
    ENVRelease = 20,       // 0..1
    LFORate = 21,          // 0..1
    LFODelay = 22,         // 0..1
    LFOTrigMode = 23,      // 0 = Manual, 1 = Auto
    LFOManualTrig = 24,    // 0 or 1
    ChorusI = 25,          // 0 or 1
    ChorusII = 26,         // 0 or 1
    DelayEnabled = 27,     // 0 or 1
    DelayTime = 28,        // 0..1
    DelayFeedback = 29,    // 0..1
    DelayMix = 30,         // 0..1
    ReverbEnabled = 31,    // 0 or 1
    ReverbType = 32,       // 0 = Plate, 1 = Hall
    ReverbTime = 33,       // 0..1
    ReverbDecay = 34,      // 0..1
    ReverbMix = 35,        // 0..1
    MasterVolume = 36,     // 0..1
    ParamCount = 37
};

inline float clampf(float v, float lo, float hi) {
    return std::max(lo, std::min(hi, v));
}

// Authentic Juno-60 Lookup Curves matching v1.1 Stable (HeraAudioEngine.ts)
struct HeraTables {
    static float getLfoRateHz(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return 21.8f * std::pow(x, 2.863f) + 0.4035f;
    }

    static float getLfoDelaySec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return std::pow(x * 1.64f, 1.923f);
    }

    static float getDcoLfoPitchCents(float v) {
        float d = clampf(v, 0.0f, 1.0f);
        // Smooth musical vibrato curve matching HeraAudioEngine.ts:
        // 0..50% fader -> 0..58 cents (fine resolution for expressive musical vibrato)
        // 50..100% fader -> 58..240 cents (wide synth pitch modulation up to 2.4 semitones)
        return d * (20.0f + 220.0f * std::pow(d, 2.15f));
    }

    static float getAttackSec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return std::max(0.004f, 0.0099f * std::exp(5.8f * x));
    }

    static float getDecaySec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return std::max(0.006f, 0.0495f * std::exp(6.0f * x));
    }

    static float getReleaseSec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return std::max(0.012f, 0.0495f * std::exp(6.0f * x));
    }

    static float getHpfFrequency(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        if (x < 0.05f) return 10.0f;
        float norm = (x - 0.05f) / 0.95f;
        return 68.53f * std::exp(4.065f * norm) + 72.63f;
    }

    static float getRangeFactor(float v) {
        int r = static_cast<int>(std::floor(clampf(v, 0.0f, 2.0f) + 0.5f));
        if (r <= 0) return 0.5f; // 16'
        if (r == 1) return 1.0f; // 8'
        return 2.0f;             // 4'
    }
};

// PolyBLEP antialiasing residual
inline float polyBlep(float t, float dt) {
    if (dt <= 0.0f) return 0.0f;
    if (t < dt) {
        t /= dt;
        return t + t - t * t - 1.0f;
    } else if (t > 1.0f - dt) {
        t = (t - 1.0f) / dt;
        return t * t + t + t + 1.0f;
    }
    return 0.0f;
}

enum class EnvStage {
    Idle = 0,
    Attack,
    Decay,
    Sustain,
    Release
};

// Lock-free command event for real-time audio thread
enum class EventType : uint8_t {
    NoteOn = 0,
    NoteOff,
    AllNotesOff,
    ArpConfig
};

struct EngineEvent {
    EventType type = EventType::NoteOn;
    int note = 0;
    float velocity = 1.0f;
    bool arpEnabled = false;
    int arpMode = 0;
    int arpRange = 1;
    float arpBpm = 120.0f;
    int arpRateDiv = 8;
};

struct JunoVoice {
    int id = 0;
    bool active = false;
    bool released = true;
    bool sameNoteDamped = false;
    int note = -1;
    uint64_t startOrder = 0;
    float velocityFactor = 1.0f;

    // Continuously running oscillator state (never reset -> zero phase clicks)
    float phase = 0.0f;
    bool subFlip = false;
    float currentFreqHz = 440.0f;

    // Amplitude & Filter RC Envelopes matching v1.1 Stable
    EnvStage envStage = EnvStage::Idle;
    float envLevel = 0.0f;
    float vcfEnvLevel = 0.0f;
    float gateEnvLevel = 0.0f;
    float lfoDelayEnv = 1.0f;

    // 4-pole cascaded lowpass state (never zeroed while ringing -> Warm Retrigger)
    float z1 = 0.0f;
    float z2 = 0.0f;
    float z3 = 0.0f;
    float z4 = 0.0f;

    void startVoice(int midiNote, float vel, uint64_t orderCounter, float rangeFactor, float initialLfoEnv) {
        bool wasActive = active;
        note = midiNote;
        startOrder = orderCounter;
        active = true;
        released = false;
        sameNoteDamped = false;

        // Linear & musical velocity scaling matching v1.1 Stable (0.45 + 0.55 * vel)
        float normVel = (vel > 1.0f) ? (vel / 127.0f) : vel;
        velocityFactor = 0.45f + 0.55f * clampf(normVel, 0.1f, 1.0f);

        float targetFreq = 440.0f * std::pow(2.0f, (static_cast<float>(midiNote) - 69.0f) / 12.0f) * rangeFactor;
        if (!wasActive) {
            currentFreqHz = targetFreq;
        }

        // Warm Capacitor Retrigger: rise from current envLevel / vcfEnvLevel without ever jumping to 0
        envLevel = std::max(0.0f, envLevel);
        vcfEnvLevel = std::max(0.0f, vcfEnvLevel);
        gateEnvLevel = std::max(0.0f, gateEnvLevel);
        lfoDelayEnv = wasActive ? std::max(lfoDelayEnv, initialLfoEnv) : initialLfoEnv;
        envStage = EnvStage::Attack;
    }

    void stopVoice() {
        if (!active || released) return;
        released = true;
        envStage = EnvStage::Release;
    }

    // Matching v1.1 Stable softenSameNoteRelease() (16ms RC decay when another Round-Robin voice plays same note)
    void softenSameNoteRelease() {
        if (!active || sameNoteDamped) return;
        sameNoteDamped = true;
        released = true;
        envStage = EnvStage::Release;
    }

    void stopImmediate() {
        released = true;
        sameNoteDamped = true;
        envStage = EnvStage::Release;
    }
};

// Modulated delay line helper for BBD Chorus, Echo Delay, and Stereo Reverb
class DelayLine {
public:
    void init(int maxSamples) {
        buffer_.assign(std::max(16, maxSamples), 0.0f);
        writePos_ = 0;
    }

    void clear() {
        std::fill(buffer_.begin(), buffer_.end(), 0.0f);
        writePos_ = 0;
    }

    void write(float sample) {
        if (buffer_.empty()) return;
        buffer_[writePos_] = sample;
        writePos_++;
        if (writePos_ >= static_cast<int>(buffer_.size())) {
            writePos_ = 0;
        }
    }

    float readInterpolated(float delaySamples) const {
        if (buffer_.empty()) return 0.0f;
        const int size = static_cast<int>(buffer_.size());
        float d = clampf(delaySamples, 1.0f, static_cast<float>(size - 2));
        float readIdx = static_cast<float>(writePos_) - d;
        while (readIdx < 0.0f) readIdx += static_cast<float>(size);
        int i0 = static_cast<int>(readIdx);
        int i1 = i0 + 1;
        if (i0 >= size) i0 -= size;
        if (i1 >= size) i1 -= size;
        float frac = readIdx - std::floor(readIdx);
        return buffer_[i0] * (1.0f - frac) + buffer_[i1] * frac;
    }

private:
    std::vector<float> buffer_;
    int writePos_ = 0;
};

// Schroeder / Moorer Allpass Diffuser for Studio Plate & Hall Reverb
class AllpassFilter {
public:
    void init(int delaySamples, float gain = 0.65f) {
        delay_.init(delaySamples + 8);
        delaySamples_ = static_cast<float>(std::max(4, delaySamples));
        gain_ = gain;
    }

    float process(float input) {
        float delayed = delay_.readInterpolated(delaySamples_);
        float v = input - gain_ * delayed;
        delay_.write(v);
        return delayed + gain_ * v;
    }

private:
    DelayLine delay_;
    float delaySamples_ = 100.0f;
    float gain_ = 0.65f;
};

// Low-Pass Damped Modulated Comb Filter for Studio Plate & Hall Reverb
class ModulatedDampedComb {
public:
    void init(int maxSamples, float lfoPhaseOffset) {
        delay_.init(maxSamples);
        lfoPhase_ = lfoPhaseOffset;
        filterStore_ = 0.0f;
    }

    float process(
        float input,
        float baseDelaySamples,
        float feedback,
        float dampCoef,
        float modDepthSamples,
        float modIncrement
    ) {
        lfoPhase_ += modIncrement;
        if (lfoPhase_ >= kTwoPi) lfoPhase_ -= kTwoPi;
        float modOffset = std::sin(lfoPhase_) * modDepthSamples;
        float delayed = delay_.readInterpolated(baseDelaySamples + modOffset);

        // One-pole low-pass damping in feedback loop
        filterStore_ = delayed * (1.0f - dampCoef) + filterStore_ * dampCoef;
        delay_.write(input + filterStore_ * feedback);
        return filterStore_;
    }

private:
    DelayLine delay_;
    float lfoPhase_ = 0.0f;
    float filterStore_ = 0.0f;
};

class HeraEngine {
public:
    HeraEngine() {
        for (int i = 0; i < kMaxVoices; ++i) {
            voices_[i].id = i;
            voices_[i].phase = static_cast<float>(i) * 0.1618f; // Natural analog free-running phase spread
        }
        setDefaults();
        setSampleRate(48000.0f);
    }

    void setDefaults() {
        setParameter(DCORange, 1.0f);          // 8'
        setParameter(DCOSawLevel, 1.0f);
        setParameter(DCOPulseLevel, 0.0f);
        setParameter(DCOSubLevel, 0.0f);
        setParameter(DCONoiseLevel, 0.0f);
        setParameter(DCOPWMDepth, 0.3f);
        setParameter(DCOPWMMod, 1.0f);         // LFO
        setParameter(DCOPitchModDepth, 0.0f);
        setParameter(HPF, 0.0f);
        setParameter(VCFCutoff, 0.7f);
        setParameter(VCFResonance, 0.0f);
        setParameter(VCFEnv, 0.0f);
        setParameter(VCFLFO, 0.0f);
        setParameter(VCFKey, 1.0f);
        setParameter(VCFBendDepth, 0.0f);
        setParameter(VCAType, 0.0f);           // ENV
        setParameter(VCADepth, 0.5f);
        setParameter(ENVAttack, 0.4f);
        setParameter(ENVDecay, 0.0f);
        setParameter(ENVSustain, 1.0f);
        setParameter(ENVRelease, 0.45f);
        setParameter(LFORate, 0.6f);
        setParameter(LFODelay, 0.0f);
        setParameter(LFOTrigMode, 1.0f);       // AUTO
        setParameter(LFOManualTrig, 0.0f);
        setParameter(ChorusI, 1.0f);
        setParameter(ChorusII, 0.0f);
        setParameter(DelayEnabled, 0.0f);
        setParameter(DelayTime, 0.35f);
        setParameter(DelayFeedback, 0.35f);
        setParameter(DelayMix, 0.25f);
        setParameter(ReverbEnabled, 0.0f);
        setParameter(ReverbType, 0.0f);        // 0 = Plate, 1 = Hall
        setParameter(ReverbTime, 0.35f);
        setParameter(ReverbDecay, 0.55f);
        setParameter(ReverbMix, 0.25f);
        setParameter(MasterVolume, 0.85f);

        for (int i = 0; i < ParamCount; ++i) {
            smoothedParams_[i] = targetParams_[i].load(std::memory_order_relaxed);
        }

        waveformRing_.fill(0.0f);
    }

    void setSampleRate(float sr) {
        sampleRate_ = std::max(8000.0f, sr);

        // Initialize BBD Chorus lines (~30ms max)
        int maxChorusSamples = static_cast<int>(sampleRate_ * 0.030f) + 64;
        chorusDelayL_.init(maxChorusSamples);
        chorusDelayR_.init(maxChorusSamples);

        // Initialize Stereo Echo Delay lines (~2.0s max matching v1.1 Stable)
        int maxEchoSamples = static_cast<int>(sampleRate_ * 2.0f) + 128;
        echoDelayL_.init(maxEchoSamples);
        echoDelayR_.init(maxEchoSamples);

        // Initialize Global Post-Processing Stereo Reverb (Plate & Hall matching v1.1 Stable)
        reverbPreDelay_.init(static_cast<int>(sampleRate_ * 0.25f) + 64);
        reverbDiffuser1L_.init(static_cast<int>(sampleRate_ * 0.0047f), 0.68f);
        reverbDiffuser2L_.init(static_cast<int>(sampleRate_ * 0.0113f), 0.62f);
        reverbDiffuser1R_.init(static_cast<int>(sampleRate_ * 0.0053f), 0.68f);
        reverbDiffuser2R_.init(static_cast<int>(sampleRate_ * 0.0127f), 0.62f);

        int maxCombSamples = static_cast<int>(sampleRate_ * 0.25f) + 64;
        for (int i = 0; i < 6; ++i) {
            reverbCombs_[i].init(maxCombSamples, static_cast<float>(i) * 1.047f);
        }
    }

    void setParameter(int id, float value) {
        if (id < 0 || id >= ParamCount) return;
        targetParams_[id].store(value, std::memory_order_relaxed);
    }

    float getParameter(int id) const {
        if (id < 0 || id >= ParamCount) return 0.0f;
        return targetParams_[id].load(std::memory_order_relaxed);
    }

    void setPitchBend(float bendNorm, float modWheel) {
        // v1.1 Stable uses +/- 2.0 semitones for pitch bend wheel
        targetPitchBendSemis_.store(clampf(bendNorm, -1.0f, 1.0f) * 2.0f, std::memory_order_relaxed);
        targetModWheel_.store(clampf(modWheel, 0.0f, 1.0f), std::memory_order_relaxed);
    }

    void setArpConfig(bool enabled, int mode, int range, float bpm, int rateDiv) {
        EngineEvent ev{};
        ev.type = EventType::ArpConfig;
        ev.arpEnabled = enabled;
        ev.arpMode = mode;
        ev.arpRange = range;
        ev.arpBpm = bpm;
        ev.arpRateDiv = rateDiv;
        pushEventLockFree(ev);
    }

    void noteOn(int midiNote, float velocity) {
        if (midiNote < 0 || midiNote > 127) return;
        EngineEvent ev{};
        ev.type = EventType::NoteOn;
        ev.note = midiNote;
        ev.velocity = velocity;
        pushEventLockFree(ev);
    }

    void noteOff(int midiNote) {
        if (midiNote < 0 || midiNote > 127) return;
        EngineEvent ev{};
        ev.type = EventType::NoteOff;
        ev.note = midiNote;
        pushEventLockFree(ev);
    }

    void allNotesOff() {
        EngineEvent ev{};
        ev.type = EventType::AllNotesOff;
        pushEventLockFree(ev);
    }

    int getActiveVoicesCount() const {
        return activeVoicesCountAtomic_.load(std::memory_order_relaxed);
    }

    void copyWaveform(float* dest, int count) const {
        int n = std::min(count, kWaveformBufferSize);
        int readIdx = waveformWritePos_.load(std::memory_order_relaxed);
        for (int i = 0; i < n; ++i) {
            int idx = (readIdx + i) % kWaveformBufferSize;
            dest[i] = waveformRing_[idx];
        }
    }

    // 100% Lock-Free Real-Time Audio Callback (Never locks std::mutex, never drops buffers!)
    void renderStereo(float* outInterleaved, int32_t numFrames) {
        // 1. Drain lock-free event queue
        drainEventsLockFree();

        const float sr = sampleRate_;
        const float invSr = 1.0f / sr;

        // One-pole RC smoothing coefficients for click-free fader movements (matching setTargetAtTime in v1.1)
        const float fastSmooth = 1.0f - std::exp(-invSr / 0.005f);   // 5ms RC smoothing
        const float medSmooth = 1.0f - std::exp(-invSr / 0.015f);    // 15ms RC smoothing
        const float freqGlideCoef = 1.0f - std::exp(-invSr / 0.0012f); // 1.2ms micro-glide on DCO pitch

        // Snapshot discrete switches & non-audio-rate targets
        const float rangeFactor = HeraTables::getRangeFactor(targetParams_[DCORange].load(std::memory_order_relaxed));
        const int pwmMod = static_cast<int>(std::round(targetParams_[DCOPWMMod].load(std::memory_order_relaxed)));
        const int vcaType = static_cast<int>(std::round(targetParams_[VCAType].load(std::memory_order_relaxed)));
        const bool lfoManualTrig = targetParams_[LFOManualTrig].load(std::memory_order_relaxed) >= 0.5f;
        const bool chorusI = targetParams_[ChorusI].load(std::memory_order_relaxed) >= 0.5f;
        const bool chorusII = targetParams_[ChorusII].load(std::memory_order_relaxed) >= 0.5f;
        const bool delayEnabled = targetParams_[DelayEnabled].load(std::memory_order_relaxed) >= 0.5f;
        const bool reverbEnabled = targetParams_[ReverbEnabled].load(std::memory_order_relaxed) >= 0.5f;
        const bool isHall = static_cast<int>(std::round(targetParams_[ReverbType].load(std::memory_order_relaxed))) >= 1;

        // ADSR times & exact v1.1 Stable RC time constants (attackSec * 0.35, decaySec * 0.33, releaseSec * 0.25)
        const float attackSec = HeraTables::getAttackSec(targetParams_[ENVAttack].load(std::memory_order_relaxed));
        const float decaySec = HeraTables::getDecaySec(targetParams_[ENVDecay].load(std::memory_order_relaxed));
        const float sustainLevel = clampf(targetParams_[ENVSustain].load(std::memory_order_relaxed), 0.0f, 1.0f);
        const float releaseSec = HeraTables::getReleaseSec(targetParams_[ENVRelease].load(std::memory_order_relaxed));

        const float attackCoef = std::exp(-invSr / std::max(0.001f, attackSec * 0.35f));
        const float decayCoef = std::exp(-invSr / std::max(0.002f, decaySec * 0.33f));
        const float releaseCoef = std::exp(-invSr / std::max(0.005f, releaseSec * 0.25f));
        const float sameNoteDampCoef = std::exp(-invSr / 0.016f); // v1.1 softenSameNoteRelease 16ms RC
        const float gateAttackCoef = std::exp(-invSr / 0.0025f);  // v1.1 2.5ms RC gate attack
        const float gateReleaseCoef = std::exp(-invSr / 0.0040f); // v1.1 4.0ms RC gate release

        const float lfoRateHz = HeraTables::getLfoRateHz(targetParams_[LFORate].load(std::memory_order_relaxed));
        const float lfoDelaySec = HeraTables::getLfoDelaySec(targetParams_[LFODelay].load(std::memory_order_relaxed));

        // BBD Chorus 7500 Hz Low-pass filter coefficient (matching v1.1 chorusFilterL/R = 7500 Hz)
        const float chorusLpfAlpha = 1.0f - std::exp(-kTwoPi * 7500.0f * invSr);
        // Tape Delay 4500 Hz Low-pass filter coefficient (matching v1.1 delayFilterL/R = 4500 Hz)
        const float delayLpfAlpha = 1.0f - std::exp(-kTwoPi * 4500.0f * invSr);
        // Reverb 135 Hz Low-cut High-pass filter coefficient (matching v1.1 lowCut = 135 Hz)
        const float reverbHpfRC = 1.0f / (kTwoPi * 135.0f);
        const float reverbHpfAlpha = reverbHpfRC / (reverbHpfRC + invSr);

        // Reverb tank parameters matching v1.1 Stable (lines 1149-1168 of HeraAudioEngine.ts)
        const float reverbTimeNorm = clampf(targetParams_[ReverbTime].load(std::memory_order_relaxed), 0.0f, 1.0f);
        const float reverbDecayNorm = clampf(targetParams_[ReverbDecay].load(std::memory_order_relaxed), 0.0f, 1.0f);
        const float reverbMixNorm = clampf(targetParams_[ReverbMix].load(std::memory_order_relaxed), 0.0f, 1.0f);

        const float preDelaySec = isHall
            ? (0.015f + reverbTimeNorm * 0.080f)
            : (0.004f + reverbTimeNorm * 0.041f);
        const float preDelaySamples = preDelaySec * sr;
        const float reverbSizeScale = isHall
            ? (1.15f + reverbTimeNorm * 0.70f)
            : (0.85f + reverbTimeNorm * 0.40f);
        const float reverbDampingHz = isHall ? 3400.0f : 6800.0f;
        const float reverbDampCoef = std::exp(-kTwoPi * reverbDampingHz * invSr);
        const float reverbFeedback = 0.32f + reverbDecayNorm * 0.605f;
        const float reverbModInc = kTwoPi * 0.41f * invSr;
        const float reverbModDepthSamples = 0.00024f * sr;
        const float baseCombTimes[6] = { 0.0297f, 0.0371f, 0.0411f, 0.0313f, 0.0389f, 0.0437f };

        // Master Peak Limiter coefficients (-1.5 dB = 0.8414f threshold, 1ms attack, 120ms release)
        const float limiterThreshold = 0.8414f;
        const float limiterAttackCoef = std::exp(-invSr / 0.001f);
        const float limiterReleaseCoef = std::exp(-invSr / 0.120f);
        const float normTanh1_2 = 1.0f / std::tanh(1.2f);

        for (int32_t frame = 0; frame < numFrames; ++frame) {
            // Smooth continuous parameters (eliminating zipper noise)
            smoothedParams_[DCOSawLevel] += fastSmooth * (targetParams_[DCOSawLevel].load(std::memory_order_relaxed) - smoothedParams_[DCOSawLevel]);
            smoothedParams_[DCOPulseLevel] += fastSmooth * (targetParams_[DCOPulseLevel].load(std::memory_order_relaxed) - smoothedParams_[DCOPulseLevel]);
            smoothedParams_[DCOSubLevel] += fastSmooth * (targetParams_[DCOSubLevel].load(std::memory_order_relaxed) - smoothedParams_[DCOSubLevel]);
            smoothedParams_[DCONoiseLevel] += fastSmooth * (targetParams_[DCONoiseLevel].load(std::memory_order_relaxed) - smoothedParams_[DCONoiseLevel]);
            smoothedParams_[DCOPWMDepth] += fastSmooth * (targetParams_[DCOPWMDepth].load(std::memory_order_relaxed) - smoothedParams_[DCOPWMDepth]);
            smoothedParams_[DCOPitchModDepth] += fastSmooth * (targetParams_[DCOPitchModDepth].load(std::memory_order_relaxed) - smoothedParams_[DCOPitchModDepth]);
            smoothedParams_[HPF] += medSmooth * (targetParams_[HPF].load(std::memory_order_relaxed) - smoothedParams_[HPF]);
            smoothedParams_[VCFCutoff] += fastSmooth * (targetParams_[VCFCutoff].load(std::memory_order_relaxed) - smoothedParams_[VCFCutoff]);
            smoothedParams_[VCFResonance] += medSmooth * (targetParams_[VCFResonance].load(std::memory_order_relaxed) - smoothedParams_[VCFResonance]);
            smoothedParams_[VCFEnv] += fastSmooth * (targetParams_[VCFEnv].load(std::memory_order_relaxed) - smoothedParams_[VCFEnv]);
            smoothedParams_[VCFLFO] += fastSmooth * (targetParams_[VCFLFO].load(std::memory_order_relaxed) - smoothedParams_[VCFLFO]);
            smoothedParams_[VCFKey] += fastSmooth * (targetParams_[VCFKey].load(std::memory_order_relaxed) - smoothedParams_[VCFKey]);
            smoothedParams_[VCFBendDepth] += fastSmooth * (targetParams_[VCFBendDepth].load(std::memory_order_relaxed) - smoothedParams_[VCFBendDepth]);
            smoothedParams_[VCADepth] += fastSmooth * (targetParams_[VCADepth].load(std::memory_order_relaxed) - smoothedParams_[VCADepth]);
            smoothedParams_[DelayTime] += medSmooth * (targetParams_[DelayTime].load(std::memory_order_relaxed) - smoothedParams_[DelayTime]);
            smoothedParams_[DelayFeedback] += medSmooth * (targetParams_[DelayFeedback].load(std::memory_order_relaxed) - smoothedParams_[DelayFeedback]);
            smoothedParams_[DelayMix] += medSmooth * (targetParams_[DelayMix].load(std::memory_order_relaxed) - smoothedParams_[DelayMix]);
            smoothedParams_[MasterVolume] += medSmooth * (targetParams_[MasterVolume].load(std::memory_order_relaxed) - smoothedParams_[MasterVolume]);

            smoothPitchBendSemis_ += fastSmooth * (targetPitchBendSemis_.load(std::memory_order_relaxed) - smoothPitchBendSemis_);
            smoothModWheel_ += fastSmooth * (targetModWheel_.load(std::memory_order_relaxed) - smoothModWheel_);

            // 1. Arpeggiator clock with 70% Gate Duty Cycle (matching v1.1 Stable lines 1313-1323)
            if (arpEnabled_ && !heldNotes_.empty()) {
                float beatsPerSec = arpBpm_ / 60.0f;
                float notesPerBeat = static_cast<float>(arpRateDiv_) / 4.0f;
                float stepDurationSamples = sr / std::max(0.5f, beatsPerSec * notesPerBeat);
                float gateOffSamples = stepDurationSamples * 0.70f;

                if (arpSampleCounter_ == 0.0f) {
                    advanceArpeggiatorStep();
                }
                arpSampleCounter_ += 1.0f;

                if (!arpGateReleased_ && arpSampleCounter_ >= gateOffSamples) {
                    arpGateReleased_ = true;
                    if (arpCurrentNote_ >= 0) {
                        triggerVoiceOff(arpCurrentNote_);
                        arpCurrentNote_ = -1;
                    }
                }
                if (arpSampleCounter_ >= stepDurationSamples) {
                    arpSampleCounter_ = 0.0f;
                    arpGateReleased_ = false;
                }
            } else {
                arpSampleCounter_ = 0.0f;
                arpGateReleased_ = false;
            }

            // 2. Global Sine LFO (matching v1.1 globalLfoOsc.type = 'sine')
            lfoPhase_ += lfoRateHz * invSr;
            if (lfoPhase_ >= 1.0f) lfoPhase_ -= 1.0f;
            const float lfoSine = std::sin(lfoPhase_ * kTwoPi);

            // 3. Paul Kellet Warm Pink Noise Generator (matching v1.1 Stable lines 673-684)
            noiseSeed_ = noiseSeed_ * 196314165u + 907633515u;
            const float white = (static_cast<float>(noiseSeed_ >> 9) / 4194304.0f) - 1.0f;
            pinkB0_ = 0.99886f * pinkB0_ + white * 0.0555179f;
            pinkB1_ = 0.99332f * pinkB1_ + white * 0.0750759f;
            pinkB2_ = 0.96900f * pinkB2_ + white * 0.1538520f;
            pinkB3_ = 0.86650f * pinkB3_ + white * 0.3104856f;
            pinkB4_ = 0.55000f * pinkB4_ + white * 0.5329522f;
            pinkB5_ = -0.7616f * pinkB5_ - white * 0.0168980f;
            const float pinkNoise = (pinkB0_ + pinkB1_ + pinkB2_ + pinkB3_ + pinkB4_ + pinkB5_ + pinkB6_ + white * 0.5362f) * 0.11f;
            pinkB6_ = white * 0.115926f;

            // Pre-filter DCO mix levels matching v1.1 Stable (0.24 / 0.24 / 0.18 / 0.12)
            const float sawGain = clampf(smoothedParams_[DCOSawLevel], 0.0f, 1.0f) * 0.24f;
            const float pulseGain = clampf(smoothedParams_[DCOPulseLevel], 0.0f, 1.0f) * 0.24f;
            const float subGain = clampf(smoothedParams_[DCOSubLevel], 0.0f, 1.0f) * 0.18f;
            const float noiseGain = clampf(smoothedParams_[DCONoiseLevel], 0.0f, 1.0f) * 0.12f;

            const float pwmDepth = clampf(smoothedParams_[DCOPWMDepth], 0.0f, 1.0f);
            const float pitchModDepth = clampf(smoothedParams_[DCOPitchModDepth], 0.0f, 1.0f);
            const float vcfCutoffNorm = clampf(smoothedParams_[VCFCutoff], 0.0f, 1.0f);
            const float vcfResNorm = clampf(smoothedParams_[VCFResonance], 0.0f, 1.0f);
            const float vcfEnvNorm = clampf(smoothedParams_[VCFEnv], -1.0f, 1.0f);
            const float vcfLfoNorm = clampf(smoothedParams_[VCFLFO], 0.0f, 1.0f);
            const float vcfKeyNorm = clampf(smoothedParams_[VCFKey], 0.0f, 1.0f);
            const float vcfBendNorm = clampf(smoothedParams_[VCFBendDepth], 0.0f, 1.0f);
            const float vcaLevel = clampf(smoothedParams_[VCADepth], 0.0f, 1.0f);

            // Base cutoff Hz matching v1.1 Stable: 16 * (20000 / 16)^VCFCutoff
            const float baseCutoffHz = 16.0f * std::pow(20000.0f / 16.0f, vcfCutoffNorm);
            const float kRes = 3.15f * std::pow(vcfResNorm, 1.1f);

            float voiceSum = 0.0f;

            // 4. Synthesize 6 Polyphonic Voices
            for (int v = 0; v < kMaxVoices; ++v) {
                JunoVoice& voice = voices_[v];
                if (!voice.active) continue;

                const float envPeak = voice.velocityFactor;
                const float voiceSustainTarget = sustainLevel * envPeak;

                // Continuous RC Capacitor ADSR Envelope matching v1.1 Stable (lines 243-255 & 474-487)
                switch (voice.envStage) {
                    case EnvStage::Attack: {
                        if (sustainLevel >= 0.99f) {
                            voice.envLevel = envPeak + (voice.envLevel - envPeak) * attackCoef;
                            voice.vcfEnvLevel = 1.0f + (voice.vcfEnvLevel - 1.0f) * attackCoef;
                            if (voice.envLevel >= envPeak * 0.995f) {
                                voice.envLevel = envPeak;
                                voice.vcfEnvLevel = 1.0f;
                                voice.envStage = EnvStage::Sustain;
                            }
                        } else {
                            float targetPeak = envPeak * 1.04f;
                            voice.envLevel = targetPeak + (voice.envLevel - targetPeak) * attackCoef;
                            voice.vcfEnvLevel = 1.04f + (voice.vcfEnvLevel - 1.04f) * attackCoef;
                            if (voice.envLevel >= envPeak) {
                                voice.envLevel = envPeak;
                                voice.vcfEnvLevel = 1.0f;
                                voice.envStage = EnvStage::Decay;
                            }
                        }
                        break;
                    }
                    case EnvStage::Decay: {
                        voice.envLevel = voiceSustainTarget + (voice.envLevel - voiceSustainTarget) * decayCoef;
                        voice.vcfEnvLevel = sustainLevel + (voice.vcfEnvLevel - sustainLevel) * decayCoef;
                        if (std::fabs(voice.envLevel - voiceSustainTarget) < 0.0005f) {
                            voice.envLevel = voiceSustainTarget;
                            voice.vcfEnvLevel = sustainLevel;
                            voice.envStage = EnvStage::Sustain;
                        }
                        break;
                    }
                    case EnvStage::Sustain: {
                        voice.envLevel = voiceSustainTarget + (voice.envLevel - voiceSustainTarget) * medSmooth;
                        voice.vcfEnvLevel = sustainLevel + (voice.vcfEnvLevel - sustainLevel) * medSmooth;
                        if (voice.released) {
                            voice.envStage = EnvStage::Release;
                        }
                        break;
                    }
                    case EnvStage::Release: {
                        float relCoef = voice.sameNoteDamped ? sameNoteDampCoef : releaseCoef;
                        voice.envLevel *= relCoef;
                        voice.vcfEnvLevel *= releaseCoef;
                        if (voice.envLevel < 0.00015f) {
                            voice.envLevel = 0.0f;
                            voice.vcfEnvLevel = 0.0f;
                            voice.envStage = EnvStage::Idle;
                        }
                        break;
                    }
                    case EnvStage::Idle:
                    default:
                        voice.envLevel = 0.0f;
                        voice.vcfEnvLevel = 0.0f;
                        break;
                }

                // Gate mode envelope (2.5ms RC attack, 4.0ms RC release matching v1.1)
                if (!voice.released) {
                    voice.gateEnvLevel = envPeak + (voice.gateEnvLevel - envPeak) * gateAttackCoef;
                } else {
                    float gRel = voice.sameNoteDamped ? sameNoteDampCoef : gateReleaseCoef;
                    voice.gateEnvLevel *= gRel;
                }

                const float ampEnv = (vcaType == 1) ? voice.gateEnvLevel : voice.envLevel;
                if (ampEnv < 0.00015f && voice.released) {
                    voice.active = false;
                    voice.note = -1;
                    voice.sameNoteDamped = false;
                    continue;
                }

                // Per-voice LFO delay RC capacitor envelope matching HeraAudioEngine.ts
                if (lfoDelaySec < 0.02f || lfoManualTrig) {
                    voice.lfoDelayEnv += fastSmooth * (1.0f - voice.lfoDelayEnv);
                } else {
                    float lfoChargeCoef = 1.0f - std::exp(-invSr / std::max(0.015f, lfoDelaySec * 0.35f));
                    voice.lfoDelayEnv += lfoChargeCoef * (1.0f - voice.lfoDelayEnv);
                }
                const float voiceLfoEnv = clampf(voice.lfoDelayEnv, 0.20f, 1.0f);
                const float dcoPitchCents = HeraTables::getDcoLfoPitchCents(pitchModDepth);
                const float modWheelCents = HeraTables::getDcoLfoPitchCents(smoothModWheel_);
                const float pitchLfoCents = lfoSine * ((dcoPitchCents * voiceLfoEnv) + modWheelCents);
                const float filterLfoCents = lfoSine * (vcfLfoNorm * 2600.0f * std::max(voiceLfoEnv, smoothModWheel_));

                // Target DCO frequency with 1.2ms micro-glide (matching v1.1 setTargetAtTime(..., 0.0012))
                float noteTargetHz = 440.0f * std::pow(2.0f, (static_cast<float>(voice.note) - 69.0f) / 12.0f) * rangeFactor;
                voice.currentFreqHz += freqGlideCoef * (noteTargetHz - voice.currentFreqHz);

                float detuneRatio = std::pow(2.0f, (smoothPitchBendSemis_ * 100.0f + pitchLfoCents) / 1200.0f);
                float freq = clampf(voice.currentFreqHz * detuneRatio, 16.0f, sr * 0.45f);
                float dt = freq * invSr;

                voice.phase += dt;
                if (voice.phase >= 1.0f) {
                    voice.phase -= 1.0f;
                    voice.subFlip = !voice.subFlip;
                }

                // PolyBLEP Sawtooth
                float saw = (2.0f * voice.phase - 1.0f) - polyBlep(voice.phase, dt);

                // PolyBLEP Pulse with PWM
                float pwModSource = 0.0f;
                if (pwmMod == 0) {
                    pwModSource = pwmDepth;
                } else if (pwmMod == 1) {
                    pwModSource = (lfoSine * 0.5f + 0.5f) * pwmDepth;
                } else {
                    pwModSource = voice.vcfEnvLevel * pwmDepth;
                }
                float pw = clampf(0.5f - 0.45f * pwModSource, 0.05f, 0.95f);

                float pulse = (voice.phase < pw) ? 1.0f : -1.0f;
                pulse += polyBlep(voice.phase, dt);
                float phase2 = voice.phase - pw;
                if (phase2 < 0.0f) phase2 += 1.0f;
                pulse -= polyBlep(phase2, dt);

                // Sub-Oscillator (-1 octave square)
                float sub = voice.subFlip ? 1.0f : -1.0f;

                float dcoMix = saw * sawGain
                             + pulse * pulseGain
                             + sub * subGain
                             + pinkNoise * noiseGain;

                // 4-Pole Cascaded VCF matching v1.1 Stable frequency equations (lines 363-383)
                float keyTrackingRatio = std::pow(2.0f, vcfKeyNorm * ((static_cast<float>(voice.note) - 60.0f) / 12.0f));
                float bendRatio = std::pow(2.0f, vcfBendNorm * (smoothPitchBendSemis_ / 12.0f));
                float envOctaves = vcfEnvNorm * 6.5f * voice.vcfEnvLevel;
                float lfoOctaves = filterLfoCents / 1200.0f;

                float cutFreq = baseCutoffHz * keyTrackingRatio * bendRatio * std::pow(2.0f, envOctaves + lfoOctaves);
                cutFreq = clampf(cutFreq, 16.0f, std::min(20000.0f, sr * 0.42f));

                float g = std::tan(kPi * cutFreq * invSr);
                float G = g / (1.0f + g);

                float feedbackSig = std::tanh(voice.z4);
                float u = (dcoMix - kRes * feedbackSig) / (1.0f + kRes * G * G * G * G);

                voice.z1 += G * (u - voice.z1);
                voice.z2 += G * (voice.z1 - voice.z2);
                voice.z3 += G * (voice.z2 - voice.z3);
                voice.z4 += G * (voice.z3 - voice.z4);

                float voiceOut = voice.z4 * ampEnv * vcaLevel;
                voiceSum += voiceOut;
            }

            // 5. Global HPF -> Soft Clipper -> Master Gain (matching v1.1 Stable lines 697-716)
            const float hpfFreq = HeraTables::getHpfFrequency(smoothedParams_[HPF]);
            const float hpfRC = 1.0f / (kTwoPi * std::max(10.0f, hpfFreq));
            const float hpfAlpha = hpfRC / (hpfRC + invSr);

            float hpfOut = hpfAlpha * (globalHpfOutPrev_ + voiceSum - globalHpfInPrev_);
            globalHpfInPrev_ = voiceSum;
            globalHpfOutPrev_ = hpfOut;

            // Musical tape-like soft saturation without harsh clipping: tanh(1.2 * x) / tanh(1.2)
            float softClipped = std::tanh(1.2f * hpfOut) * normTanh1_2;
            float preChorusBus = softClipped * ( clampf(smoothedParams_[MasterVolume], 0.0f, 1.0f) * 0.85f );

            // 6. Authentic Roland Juno-60 Stereo BBD Chorus (Modes I, II, I+II with 7500Hz LPF & 180-deg inverted Right wet)
            float stereoL = preChorusBus;
            float stereoR = preChorusBus;

            chorusDelayL_.write(preChorusBus);
            chorusDelayR_.write(preChorusBus);

            const int chorusMode = (chorusI ? 1 : 0) | (chorusII ? 2 : 0);
            if (chorusMode != 0) {
                float chorusRateHz = 0.513f;
                float baseDelaySecL = 0.0040f;
                float baseDelaySecR = 0.0044f;
                float modDepthSec = 0.0013f;
                float dryGain = 0.65f;
                float wetGain = 0.52f;

                if (chorusMode == 2) {
                    // Chorus II
                    chorusRateHz = 0.863f;
                    baseDelaySecL = 0.0052f;
                    baseDelaySecR = 0.0058f;
                    modDepthSec = 0.0024f;
                    dryGain = 0.48f;
                    wetGain = 0.68f;
                } else if (chorusMode == 3) {
                    // Chorus I + II
                    chorusRateHz = 1.02f;
                    baseDelaySecL = 0.0046f;
                    baseDelaySecR = 0.0050f;
                    modDepthSec = 0.0016f;
                    dryGain = 0.50f;
                    wetGain = 0.60f;
                }

                chorusPhase_ += chorusRateHz * invSr;
                if (chorusPhase_ >= 1.0f) chorusPhase_ -= 1.0f;
                float chorusLfo = std::sin(chorusPhase_ * kTwoPi);

                float delaySamplesL = (baseDelaySecL + chorusLfo * modDepthSec) * sr;
                float delaySamplesR = (baseDelaySecR - chorusLfo * modDepthSec) * sr;

                float rawWetL = chorusDelayL_.readInterpolated(delaySamplesL);
                float rawWetR = chorusDelayR_.readInterpolated(delaySamplesR);

                // 7.5 kHz BBD low-pass reconstruction filter
                chorusLpfL_ += chorusLpfAlpha * (rawWetL - chorusLpfL_);
                chorusLpfR_ += chorusLpfAlpha * (rawWetR - chorusLpfR_);

                // 180-degree inverted polarity on Right wet channel matching v1.1 Stable (line 794)
                stereoL = preChorusBus * dryGain + chorusLpfL_ * wetGain;
                stereoR = preChorusBus * dryGain - chorusLpfR_ * wetGain;
            }

            // 7. Stereo Tape Echo Delay (matching v1.1 Stable lines 1091-1107)
            const float delayMix = clampf(smoothedParams_[DelayMix], 0.0f, 1.0f);
            if (delayEnabled && delayMix > 0.001f) {
                float baseTimeSec = 0.06f + clampf(smoothedParams_[DelayTime], 0.0f, 1.0f) * 0.69f;
                float timeL = clampf(baseTimeSec, 0.01f, 1.8f);
                float timeR = clampf(baseTimeSec * 1.333f, 0.01f, 1.8f);

                float fb = clampf(smoothedParams_[DelayFeedback], 0.0f, 0.85f) * 0.72f * 0.45f;
                float wet = delayMix * 0.65f;
                float dry = std::max(0.0f, 1.0f - (wet * 0.35f));

                float delL = echoDelayL_.readInterpolated(timeL * sr);
                float delR = echoDelayR_.readInterpolated(timeR * sr);

                // 4500 Hz warm tape low-pass absorption filter
                echoFilterL_ += delayLpfAlpha * (delL - echoFilterL_);
                echoFilterR_ += delayLpfAlpha * (delR - echoFilterR_);

                // Cross-fed stereo feedback loop matching v1.1 Stable (lines 856-865)
                echoDelayL_.write(stereoL + (echoFilterL_ + echoFilterR_) * fb);
                echoDelayR_.write(stereoR + (echoFilterR_ + echoFilterL_) * fb);

                stereoL = stereoL * dry + delL * wet;
                stereoR = stereoR * dry + delR * wet;
            } else {
                echoDelayL_.write(0.0f);
                echoDelayR_.write(0.0f);
                echoFilterL_ = 0.0f;
                echoFilterR_ = 0.0f;
            }

            // 8. Global Post-Processing Stereo Reverb (matching v1.1 Stable lines 891-999 & 1146-1191)
            if (reverbEnabled && reverbMixNorm > 0.001f) {
                float revIn = (stereoL + stereoR) * 0.5f;
                reverbPreDelay_.write(revIn);
                float preDelayed = reverbPreDelay_.readInterpolated(preDelaySamples);

                // 135 Hz Low-Cut High-Pass filter keeping low-end tight and clean
                float lowCutOut = reverbHpfAlpha * (reverbLowCutOutPrev_ + preDelayed - reverbLowCutInPrev_);
                reverbLowCutInPrev_ = preDelayed;
                reverbLowCutOutPrev_ = lowCutOut;

                // Dual Allpass Diffusers
                float diffL = reverbDiffuser2L_.process(reverbDiffuser1L_.process(lowCutOut));
                float diffR = reverbDiffuser2R_.process(reverbDiffuser1R_.process(lowCutOut));

                float leftSum = 0.0f;
                float rightSum = 0.0f;
                for (int c = 0; c < 6; ++c) {
                    float cDelaySamples = std::min(0.22f, baseCombTimes[c] * reverbSizeScale) * sr;
                    float modDepth = (c == 1) ? reverbModDepthSamples : ((c == 4) ? -reverbModDepthSamples : 0.0f);
                    float cIn = (c < 3) ? diffL : diffR;
                    float cOut = reverbCombs_[c].process(
                        cIn,
                        cDelaySamples,
                        reverbFeedback,
                        reverbDampCoef,
                        modDepth,
                        reverbModInc
                    ) * 0.28f;

                    if (c < 3) {
                        leftSum += cOut;
                    } else {
                        rightSum += cOut;
                    }
                }

                // Cross-matrix 0.28 matching v1.1 Stable (lines 933-942)
                float revOutL = leftSum + rightSum * 0.28f;
                float revOutR = rightSum + leftSum * 0.28f;

                float wet = reverbMixNorm * 0.78f;
                float dry = std::max(0.25f, 1.0f - wet * 0.32f);

                stereoL = stereoL * dry + revOutL * wet;
                stereoR = stereoR * dry + revOutR * wet;
            }

            // 9. Master Dynamics Peak Limiter (-1.5 dB threshold, 1ms attack, 120ms release matching v1.1 Stable lines 877-882)
            float peakAbs = std::max(std::fabs(stereoL), std::fabs(stereoR));
            if (peakAbs > limiterEnv_) {
                limiterEnv_ = peakAbs + (limiterEnv_ - peakAbs) * limiterAttackCoef;
            } else {
                limiterEnv_ = peakAbs + (limiterEnv_ - peakAbs) * limiterReleaseCoef;
            }

            float limiterGain = 1.0f;
            if (limiterEnv_ > limiterThreshold) {
                float over = limiterEnv_ / limiterThreshold;
                limiterGain = std::pow(over, -0.875f); // 8:1 compression ratio above -1.5 dB
            }

            float outL = clampf(stereoL * limiterGain, -1.0f, 1.0f);
            float outR = clampf(stereoR * limiterGain, -1.0f, 1.0f);

            outInterleaved[frame * 2] = outL;
            outInterleaved[frame * 2 + 1] = outR;

            // 10. Write to Oscilloscope Ring Buffer (decimated every 4 samples)
            scopeDecimator_++;
            if (scopeDecimator_ >= 4) {
                scopeDecimator_ = 0;
                int wPos = waveformWritePos_.load(std::memory_order_relaxed);
                waveformRing_[wPos] = (outL + outR) * 0.5f;
                waveformWritePos_.store((wPos + 1) % kWaveformBufferSize, std::memory_order_relaxed);
            }
        }

        // Publish active held voices count atomically for UI LEDs
        int activeCount = 0;
        for (int i = 0; i < kMaxVoices; ++i) {
            if (voices_[i].active && !voices_[i].released) {
                activeCount++;
            }
        }
        activeVoicesCountAtomic_.store(activeCount, std::memory_order_relaxed);
    }

private:
    void pushEventLockFree(const EngineEvent& ev) {
        while (producerLock_.test_and_set(std::memory_order_acquire)) {
            // Short spin only between UI/MIDI producer threads (never blocks audio thread)
        }
        uint32_t w = eventWriteIdx_.load(std::memory_order_relaxed);
        uint32_t r = eventReadIdx_.load(std::memory_order_acquire);
        if (((w + 1) & kEventQueueMask) != (r & kEventQueueMask)) {
            eventQueue_[w & kEventQueueMask] = ev;
            eventWriteIdx_.store(w + 1, std::memory_order_release);
        }
        producerLock_.clear(std::memory_order_release);
    }

    void drainEventsLockFree() {
        uint32_t r = eventReadIdx_.load(std::memory_order_relaxed);
        uint32_t w = eventWriteIdx_.load(std::memory_order_acquire);
        while (r != w) {
            const EngineEvent& ev = eventQueue_[r & kEventQueueMask];
            handleEventOnAudioThread(ev);
            r++;
        }
        eventReadIdx_.store(r, std::memory_order_release);
    }

    void handleEventOnAudioThread(const EngineEvent& ev) {
        switch (ev.type) {
            case EventType::NoteOn: {
                if (arpEnabled_) {
                    if (std::find(heldNotes_.begin(), heldNotes_.end(), ev.note) == heldNotes_.end()) {
                        if (heldNotes_.empty()) {
                            arpSampleCounter_ = 0.0f;
                            arpGateReleased_ = false;
                            arpStepIndex_ = 0;
                        }
                        heldNotes_.push_back(ev.note);
                        std::sort(heldNotes_.begin(), heldNotes_.end());
                    }
                } else {
                    triggerVoiceOn(ev.note, ev.velocity);
                }
                break;
            }
            case EventType::NoteOff: {
                auto it = std::find(heldNotes_.begin(), heldNotes_.end(), ev.note);
                if (it != heldNotes_.end()) {
                    heldNotes_.erase(it);
                }
                if (arpEnabled_) {
                    if (heldNotes_.empty() && arpCurrentNote_ >= 0) {
                        triggerVoiceOff(arpCurrentNote_);
                        arpCurrentNote_ = -1;
                        arpStepIndex_ = 0;
                    }
                } else {
                    triggerVoiceOff(ev.note);
                }
                break;
            }
            case EventType::AllNotesOff: {
                heldNotes_.clear();
                if (arpCurrentNote_ >= 0) {
                    triggerVoiceOff(arpCurrentNote_);
                    arpCurrentNote_ = -1;
                }
                for (int i = 0; i < kMaxVoices; ++i) {
                    voices_[i].stopImmediate();
                }
                break;
            }
            case EventType::ArpConfig: {
                bool wasEnabled = arpEnabled_;
                arpEnabled_ = ev.arpEnabled;
                arpMode_ = clampf(static_cast<float>(ev.arpMode), 0.0f, 2.0f);
                arpRange_ = std::max(1, std::min(3, ev.arpRange));
                arpBpm_ = clampf(ev.arpBpm, 40.0f, 260.0f);
                arpRateDiv_ = std::max(1, ev.arpRateDiv);
                if (wasEnabled && !arpEnabled_) {
                    if (arpCurrentNote_ >= 0) {
                        triggerVoiceOff(arpCurrentNote_);
                        arpCurrentNote_ = -1;
                    }
                    heldNotes_.clear();
                }
                break;
            }
        }
    }

    // Authentic 6-Voice Round-Robin + Warm Analog Retrigger + softenSameNoteRelease matching v1.1 Stable (lines 1326-1372)
    void triggerVoiceOn(int midiNote, float velocity) {
        int selectedIdx = -1;

        // 1. Search in Round-Robin order for the next completely free/inactive voice
        for (int i = 0; i < kMaxVoices; ++i) {
            int idx = (rrIndex_ + i) % kMaxVoices;
            if (!voices_[idx].active) {
                selectedIdx = idx;
                rrIndex_ = (idx + 1) % kMaxVoices;
                break;
            }
        }

        // 2. If all 6 voices are active, pick the oldest voice in release for Warm Retrigger
        if (selectedIdx < 0) {
            uint64_t oldestOrder = UINT64_MAX;
            for (int i = 0; i < kMaxVoices; ++i) {
                if (voices_[i].released && voices_[i].startOrder < oldestOrder) {
                    oldestOrder = voices_[i].startOrder;
                    selectedIdx = i;
                }
            }
            if (selectedIdx >= 0) {
                rrIndex_ = (selectedIdx + 1) % kMaxVoices;
            }
        }

        // 3. If all 6 voices are currently held, steal the oldest voice overall for Warm Retrigger
        if (selectedIdx < 0) {
            uint64_t oldestOrder = UINT64_MAX;
            for (int i = 0; i < kMaxVoices; ++i) {
                if (voices_[i].startOrder < oldestOrder) {
                    oldestOrder = voices_[i].startOrder;
                    selectedIdx = i;
                }
            }
            if (selectedIdx < 0) selectedIdx = 0;
            rrIndex_ = (selectedIdx + 1) % kMaxVoices;
        }

        // 4. Softly damp any OTHER voice that is still ringing the exact same MIDI note (16ms RC decay)
        //    and preserve warm LFO delay charge across legato/arpeggio voices
        float maxActiveLfoEnv = arpEnabled_ ? 1.0f : 0.20f;
        for (int i = 0; i < kMaxVoices; ++i) {
            if (i != selectedIdx && voices_[i].active) {
                maxActiveLfoEnv = std::max(maxActiveLfoEnv, voices_[i].lfoDelayEnv);
                if (voices_[i].note == midiNote) {
                    voices_[i].softenSameNoteRelease();
                }
            }
        }

        const float rangeFactor = HeraTables::getRangeFactor(targetParams_[DCORange].load(std::memory_order_relaxed));
        const float lfoDelaySec = HeraTables::getLfoDelaySec(targetParams_[LFODelay].load(std::memory_order_relaxed));
        const float initialLfoEnv = (lfoDelaySec < 0.02f) ? 1.0f : maxActiveLfoEnv;
        noteOrderCounter_++;
        voices_[selectedIdx].startVoice(midiNote, velocity, noteOrderCounter_, rangeFactor, initialLfoEnv);
    }

    void triggerVoiceOff(int midiNote) {
        for (int i = 0; i < kMaxVoices; ++i) {
            if (voices_[i].active && !voices_[i].released && voices_[i].note == midiNote) {
                voices_[i].stopVoice();
            }
        }
    }

    void advanceArpeggiatorStep() {
        if (heldNotes_.empty()) return;

        std::vector<int> sequence;
        sequence.reserve(heldNotes_.size() * arpRange_);
        for (int oct = 0; oct < arpRange_; ++oct) {
            for (int baseNote : heldNotes_) {
                int n = baseNote + oct * 12;
                if (n <= 127) sequence.push_back(n);
            }
        }
        if (sequence.empty()) return;

        int mode = static_cast<int>(std::round(arpMode_));
        if (mode == 2) {
            // DOWN
            std::reverse(sequence.begin(), sequence.end());
        } else if (mode == 1 && sequence.size() > 2) {
            // UP / DOWN
            int topIdx = static_cast<int>(sequence.size()) - 2;
            for (int i = topIdx; i >= 1; --i) {
                sequence.push_back(sequence[i]);
            }
        }

        if (arpCurrentNote_ >= 0) {
            triggerVoiceOff(arpCurrentNote_);
        }

        int idx = arpStepIndex_ % static_cast<int>(sequence.size());
        arpCurrentNote_ = sequence[idx];
        arpStepIndex_ = (arpStepIndex_ + 1) % static_cast<int>(sequence.size());
        triggerVoiceOn(arpCurrentNote_, 95.0f);
    }

    // Lock-free Event Queue
    std::array<EngineEvent, kEventQueueSize> eventQueue_{};
    std::atomic<uint32_t> eventWriteIdx_{0};
    std::atomic<uint32_t> eventReadIdx_{0};
    std::atomic_flag producerLock_ = ATOMIC_FLAG_INIT;

    float sampleRate_ = 48000.0f;
    std::array<std::atomic<float>, ParamCount> targetParams_{};
    std::array<float, ParamCount> smoothedParams_{};

    std::atomic<float> targetPitchBendSemis_{0.0f};
    std::atomic<float> targetModWheel_{0.0f};
    float smoothPitchBendSemis_ = 0.0f;
    float smoothModWheel_ = 0.0f;

    std::array<JunoVoice, kMaxVoices> voices_{};
    int rrIndex_ = 0;
    uint64_t noteOrderCounter_ = 0;
    std::atomic<int> activeVoicesCountAtomic_{0};

    // Global HPF state
    float globalHpfInPrev_ = 0.0f;
    float globalHpfOutPrev_ = 0.0f;

    // LFO state
    float lfoPhase_ = 0.0f;

    // Paul Kellet Pink Noise state
    uint32_t noiseSeed_ = 22222u;
    float pinkB0_ = 0.0f;
    float pinkB1_ = 0.0f;
    float pinkB2_ = 0.0f;
    float pinkB3_ = 0.0f;
    float pinkB4_ = 0.0f;
    float pinkB5_ = 0.0f;
    float pinkB6_ = 0.0f;

    // Arpeggiator state
    bool arpEnabled_ = false;
    float arpMode_ = 0.0f; // 0=UP, 1=UP/DOWN, 2=DOWN
    int arpRange_ = 1;
    float arpBpm_ = 120.0f;
    int arpRateDiv_ = 8;
    float arpSampleCounter_ = 0.0f;
    bool arpGateReleased_ = false;
    int arpStepIndex_ = 0;
    int arpCurrentNote_ = -1;
    std::vector<int> heldNotes_;

    // Stereo BBD Chorus state
    float chorusPhase_ = 0.0f;
    DelayLine chorusDelayL_;
    DelayLine chorusDelayR_;
    float chorusLpfL_ = 0.0f;
    float chorusLpfR_ = 0.0f;

    // Stereo Echo Delay state
    DelayLine echoDelayL_;
    DelayLine echoDelayR_;
    float echoFilterL_ = 0.0f;
    float echoFilterR_ = 0.0f;

    // Global Post-Processing Stereo Reverb (Plate & Hall)
    DelayLine reverbPreDelay_;
    float reverbLowCutInPrev_ = 0.0f;
    float reverbLowCutOutPrev_ = 0.0f;
    AllpassFilter reverbDiffuser1L_;
    AllpassFilter reverbDiffuser2L_;
    AllpassFilter reverbDiffuser1R_;
    AllpassFilter reverbDiffuser2R_;
    std::array<ModulatedDampedComb, 6> reverbCombs_;

    // Master Peak Limiter state
    float limiterEnv_ = 0.0f;

    // Oscilloscope Ring Buffer
    std::array<float, kWaveformBufferSize> waveformRing_{};
    std::atomic<int> waveformWritePos_{0};
    int scopeDecimator_ = 0;
};

} // namespace hera
