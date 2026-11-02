#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <vector>
#include <array>
#include <mutex>
#include <atomic>

namespace hera {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 6.28318530717958647692f;
constexpr int kMaxVoices = 6;
constexpr int kWaveformBufferSize = 512;

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
    VCFEnv = 11,           // 0..1
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

// Authentic Juno-60 Lookup Curves (ported from Hera C++ tables)
struct HeraTables {
    static float getLfoRateHz(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return 21.8f * std::pow(x, 2.863f) + 0.4035f;
    }

    static float getLfoDelaySec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return std::pow(x * 1.64f, 1.923f);
    }

    static float getAttackSec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return 0.0015f + 0.0099f * std::exp(5.8f * x);
    }

    static float getDecaySec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return 0.005f + 0.0495f * std::exp(6.0f * x);
    }

    static float getReleaseSec(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        return 0.005f + 0.0495f * std::exp(6.0f * x);
    }

    static float getHpfFrequency(float v) {
        float x = clampf(v, 0.0f, 1.0f);
        if (x < 0.05f) return 10.0f;
        float norm = (x - 0.05f) / 0.95f;
        return 68.53f * std::exp(4.065f * norm) + 72.63f;
    }

    static float getRangeFactor(float v) {
        int r = static_cast<int>(std::round(v));
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

struct JunoVoice {
    bool active = false;
    bool gate = false;
    int note = -1;
    float velocity = 1.0f;

    float phase = 0.0f;
    float subPhase = 0.0f;
    bool subFlip = false;

    EnvStage envStage = EnvStage::Idle;
    float envLevel = 0.0f;
    float gateEnvLevel = 0.0f;

    // 4-pole OTA cascaded lowpass state
    float z1 = 0.0f;
    float z2 = 0.0f;
    float z3 = 0.0f;
    float z4 = 0.0f;

    // 1-pole High-pass state
    float hpfInPrev = 0.0f;
    float hpfOutPrev = 0.0f;

    void trigger(int midiNote, float vel, bool warmRetrigger) {
        note = midiNote;
        velocity = clampf(vel, 0.05f, 1.0f);
        gate = true;
        active = true;
        envStage = EnvStage::Attack;
        if (!warmRetrigger) {
            // Keep existing filter/env level if warm retrigger, else start clean from current level
            envLevel = std::max(0.0f, envLevel);
            gateEnvLevel = std::max(0.0f, gateEnvLevel);
        }
    }

    void releaseNote() {
        if (gate) {
            gate = false;
            if (envStage != EnvStage::Idle) {
                envStage = EnvStage::Release;
            }
        }
    }

    void reset() {
        active = false;
        gate = false;
        note = -1;
        envStage = EnvStage::Idle;
        envLevel = 0.0f;
        gateEnvLevel = 0.0f;
        z1 = z2 = z3 = z4 = 0.0f;
        hpfInPrev = hpfOutPrev = 0.0f;
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

    void setGain(float g) { gain_ = clampf(g, 0.1f, 0.85f); }

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
        float damp,
        float modDepthSamples,
        float modIncrement
    ) {
        lfoPhase_ += modIncrement;
        if (lfoPhase_ >= kTwoPi) lfoPhase_ -= kTwoPi;
        float modOffset = std::sin(lfoPhase_) * modDepthSamples;
        float delayed = delay_.readInterpolated(baseDelaySamples + modOffset);

        // One-pole low-pass damping in feedback loop
        filterStore_ = delayed * (1.0f - damp) + filterStore_ * damp;
        delay_.write(input + filterStore_ * feedback);
        return delayed;
    }

private:
    DelayLine delay_;
    float lfoPhase_ = 0.0f;
    float filterStore_ = 0.0f;
};

class HeraEngine {
public:
    HeraEngine() {
        setDefaults();
        setSampleRate(48000.0f);
    }

    void setDefaults() {
        params_[DCORange] = 1.0f;          // 8'
        params_[DCOSawLevel] = 1.0f;
        params_[DCOPulseLevel] = 0.0f;
        params_[DCOSubLevel] = 0.0f;
        params_[DCONoiseLevel] = 0.0f;
        params_[DCOPWMDepth] = 0.3f;
        params_[DCOPWMMod] = 1.0f;         // LFO
        params_[DCOPitchModDepth] = 0.0f;
        params_[HPF] = 0.0f;
        params_[VCFCutoff] = 0.7f;
        params_[VCFResonance] = 0.0f;
        params_[VCFEnv] = 0.0f;
        params_[VCFLFO] = 0.0f;
        params_[VCFKey] = 1.0f;
        params_[VCFBendDepth] = 0.0f;
        params_[VCAType] = 0.0f;           // ENV
        params_[VCADepth] = 0.5f;
        params_[ENVAttack] = 0.4f;
        params_[ENVDecay] = 0.0f;
        params_[ENVSustain] = 1.0f;
        params_[ENVRelease] = 0.45f;
        params_[LFORate] = 0.6f;
        params_[LFODelay] = 0.0f;
        params_[LFOTrigMode] = 1.0f;       // AUTO
        params_[LFOManualTrig] = 0.0f;
        params_[ChorusI] = 1.0f;
        params_[ChorusII] = 0.0f;
        params_[DelayEnabled] = 0.0f;
        params_[DelayTime] = 0.35f;
        params_[DelayFeedback] = 0.35f;
        params_[DelayMix] = 0.25f;
        params_[ReverbEnabled] = 0.0f;
        params_[ReverbType] = 0.0f;        // 0 = Plate, 1 = Hall
        params_[ReverbTime] = 0.35f;
        params_[ReverbDecay] = 0.55f;
        params_[ReverbMix] = 0.25f;
        params_[MasterVolume] = 0.8f;

        waveformRing_.fill(0.0f);
    }

    void setSampleRate(float sr) {
        std::lock_guard<std::mutex> lock(mutex_);
        sampleRate_ = std::max(8000.0f, sr);

        // Initialize BBD Chorus lines (~25ms max)
        int maxChorusSamples = static_cast<int>(sampleRate_ * 0.030f) + 64;
        chorusDelayL_.init(maxChorusSamples);
        chorusDelayR_.init(maxChorusSamples);

        // Initialize Stereo Echo Delay lines (~1.5s max)
        int maxEchoSamples = static_cast<int>(sampleRate_ * 1.5f) + 128;
        echoDelayL_.init(maxEchoSamples);
        echoDelayR_.init(maxEchoSamples);

        // Initialize Global Post-Processing Stereo Reverb (Plate & Hall)
        reverbPreDelay_.init(static_cast<int>(sampleRate_ * 0.15f) + 64);
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
        params_[id] = value;
    }

    float getParameter(int id) const {
        if (id < 0 || id >= ParamCount) return 0.0f;
        return params_[id];
    }

    void setPitchBend(float bendSemitones, float modWheel) {
        pitchBend_ = clampf(bendSemitones, -1.0f, 1.0f);
        modWheel_ = clampf(modWheel, 0.0f, 1.0f);
    }

    void setArpConfig(bool enabled, int mode, int range, float bpm, int rateDiv) {
        std::lock_guard<std::mutex> lock(mutex_);
        bool wasEnabled = arpEnabled_;
        arpEnabled_ = enabled;
        arpMode_ = clampf(static_cast<float>(mode), 0.0f, 2.0f);
        arpRange_ = std::max(1, std::min(3, range));
        arpBpm_ = clampf(bpm, 40.0f, 240.0f);
        arpRateDiv_ = std::max(1, rateDiv); // 4=1/4, 8=1/8, 16=1/16

        if (wasEnabled && !enabled) {
            if (arpCurrentNote_ >= 0) {
                triggerVoiceOffLocked(arpCurrentNote_);
                arpCurrentNote_ = -1;
            }
            heldNotes_.clear();
        }
    }

    void noteOn(int midiNote, float velocity) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (midiNote < 0 || midiNote > 127) return;

        if (arpEnabled_) {
            if (std::find(heldNotes_.begin(), heldNotes_.end(), midiNote) == heldNotes_.end()) {
                heldNotes_.push_back(midiNote);
                std::sort(heldNotes_.begin(), heldNotes_.end());
            }
            return;
        }

        triggerVoiceOnLocked(midiNote, velocity);
    }

    void noteOff(int midiNote) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (midiNote < 0 || midiNote > 127) return;

        auto it = std::find(heldNotes_.begin(), heldNotes_.end(), midiNote);
        if (it != heldNotes_.end()) {
            heldNotes_.erase(it);
        }

        if (arpEnabled_) {
            if (heldNotes_.empty() && arpCurrentNote_ >= 0) {
                triggerVoiceOffLocked(arpCurrentNote_);
                arpCurrentNote_ = -1;
                arpStepIndex_ = 0;
            }
            return;
        }

        triggerVoiceOffLocked(midiNote);
    }

    void allNotesOff() {
        std::lock_guard<std::mutex> lock(mutex_);
        heldNotes_.clear();
        arpCurrentNote_ = -1;
        for (int i = 0; i < kMaxVoices; ++i) {
            voices_[i].reset();
        }
    }

    int getActiveVoicesCount() const {
        int count = 0;
        for (int i = 0; i < kMaxVoices; ++i) {
            if (voices_[i].active && voices_[i].gate) {
                count++;
            }
        }
        return count;
    }

    void copyWaveform(float* dest, int count) const {
        int n = std::min(count, kWaveformBufferSize);
        int readIdx = waveformWritePos_.load(std::memory_order_relaxed);
        for (int i = 0; i < n; ++i) {
            int idx = (readIdx + i) % kWaveformBufferSize;
            dest[i] = waveformRing_[idx];
        }
    }

    void renderStereo(float* outInterleaved, int32_t numFrames) {
        std::unique_lock<std::mutex> lock(mutex_, std::try_to_lock);
        if (!lock.owns_lock()) {
            std::memset(outInterleaved, 0, sizeof(float) * numFrames * 2);
            return;
        }

        const float sr = sampleRate_;
        const float invSr = 1.0f / sr;

        // Snapshot parameters
        const float rangeFactor = HeraTables::getRangeFactor(params_[DCORange]);
        const float sawLevel = clampf(params_[DCOSawLevel], 0.0f, 1.0f);
        const float pulseLevel = clampf(params_[DCOPulseLevel], 0.0f, 1.0f);
        const float subLevel = clampf(params_[DCOSubLevel], 0.0f, 1.0f);
        const float noiseLevel = clampf(params_[DCONoiseLevel], 0.0f, 1.0f);
        const float pwmDepth = clampf(params_[DCOPWMDepth], 0.0f, 1.0f);
        const int pwmMod = static_cast<int>(std::round(params_[DCOPWMMod]));
        const float pitchModDepth = clampf(params_[DCOPitchModDepth], 0.0f, 1.0f);

        const float hpfFreq = HeraTables::getHpfFrequency(params_[HPF]);
        const float hpfRC = 1.0f / (kTwoPi * std::max(10.0f, hpfFreq));
        const float hpfAlpha = hpfRC / (hpfRC + invSr);

        const float vcfCutoffParam = clampf(params_[VCFCutoff], 0.0f, 1.0f);
        const float vcfResParam = clampf(params_[VCFResonance], 0.0f, 1.0f);
        const float vcfEnvParam = clampf(params_[VCFEnv], -1.0f, 1.0f);
        const float vcfLfoParam = clampf(params_[VCFLFO], 0.0f, 1.0f);
        const float vcfKeyParam = clampf(params_[VCFKey], 0.0f, 1.0f);
        const float vcfBendParam = clampf(params_[VCFBendDepth], 0.0f, 1.0f);

        const int vcaType = static_cast<int>(std::round(params_[VCAType]));
        const float vcaDepth = clampf(params_[VCADepth], 0.0f, 1.0f);

        const float attackSec = HeraTables::getAttackSec(params_[ENVAttack]);
        const float decaySec = HeraTables::getDecaySec(params_[ENVDecay]);
        const float sustainLevel = clampf(params_[ENVSustain], 0.0f, 1.0f);
        const float releaseSec = HeraTables::getReleaseSec(params_[ENVRelease]);

        const float attackCoef = std::exp(-invSr / std::max(0.0005f, attackSec * 0.45f));
        const float decayCoef = std::exp(-invSr / std::max(0.001f, decaySec * 0.35f));
        const float releaseCoef = std::exp(-invSr / std::max(0.001f, releaseSec * 0.35f));
        const float gateCoef = std::exp(-invSr / 0.0035f);

        const float lfoRateHz = HeraTables::getLfoRateHz(params_[LFORate]);
        const float lfoDelaySec = HeraTables::getLfoDelaySec(params_[LFODelay]);
        const int lfoTrigMode = static_cast<int>(std::round(params_[LFOTrigMode]));
        const bool lfoManualTrig = params_[LFOManualTrig] >= 0.5f;

        const bool chorusI = params_[ChorusI] >= 0.5f;
        const bool chorusII = params_[ChorusII] >= 0.5f;

        const bool delayEnabled = params_[DelayEnabled] >= 0.5f;
        const float delayTimeParam = clampf(params_[DelayTime], 0.0f, 1.0f);
        const float delayFeedbackParam = clampf(params_[DelayFeedback], 0.0f, 0.92f);
        const float delayMixParam = clampf(params_[DelayMix], 0.0f, 1.0f);

        const bool reverbEnabled = params_[ReverbEnabled] >= 0.5f;
        const int reverbType = static_cast<int>(std::round(params_[ReverbType])); // 0=Plate, 1=Hall
        const float reverbTimeParam = clampf(params_[ReverbTime], 0.0f, 1.0f);
        const float reverbDecayParam = clampf(params_[ReverbDecay], 0.0f, 1.0f);
        const float reverbMixParam = clampf(params_[ReverbMix], 0.0f, 1.0f);

        const float masterVolume = clampf(params_[MasterVolume], 0.0f, 1.0f);

        // Precompute reverb parameters outside sample loop
        const bool isHall = (reverbType == 1);
        const float preDelaySec = isHall
            ? (0.018f + reverbTimeParam * 0.095f)
            : (0.004f + reverbTimeParam * 0.045f);
        const float preDelaySamples = preDelaySec * sr;
        const float timeScale = isHall
            ? (1.15f + reverbTimeParam * 0.65f)
            : (0.65f + reverbTimeParam * 0.55f);
        const float reverbFeedback = isHall
            ? (0.74f + reverbDecayParam * 0.21f)
            : (0.70f + reverbDecayParam * 0.23f);
        const float reverbDamp = isHall
            ? (0.45f - reverbDecayParam * 0.22f)
            : (0.25f - reverbDecayParam * 0.14f);
        const float reverbModInc = kTwoPi * (isHall ? 0.55f : 0.95f) * invSr;
        const float reverbModDepthSamples = (isHall ? 0.0014f : 0.0008f) * sr;
        const float combBaseSec[6] = { 0.0297f, 0.0371f, 0.0411f, 0.0437f, 0.0531f, 0.0617f };

        for (int32_t frame = 0; frame < numFrames; ++frame) {
            // 1. Arpeggiator clock step
            if (arpEnabled_ && !heldNotes_.empty()) {
                float beatsPerSec = arpBpm_ / 60.0f;
                float notesPerBeat = static_cast<float>(arpRateDiv_) / 4.0f;
                float stepDurationSamples = sr / std::max(0.5f, beatsPerSec * notesPerBeat);
                arpSampleCounter_ += 1.0f;
                if (arpSampleCounter_ >= stepDurationSamples) {
                    arpSampleCounter_ = 0.0f;
                    advanceArpeggiatorStepLocked();
                }
            } else {
                arpSampleCounter_ = 0.0f;
            }

            // 2. Global LFO
            bool anyGateActive = false;
            for (int v = 0; v < kMaxVoices; ++v) {
                if (voices_[v].gate) {
                    anyGateActive = true;
                    break;
                }
            }

            lfoPhase_ += lfoRateHz * invSr;
            if (lfoPhase_ >= 1.0f) lfoPhase_ -= 1.0f;
            // Triangle LFO (-1..+1)
            float lfoTri = 4.0f * std::fabs(lfoPhase_ - 0.5f) - 1.0f;

            bool lfoTriggered = (lfoTrigMode == 1) ? anyGateActive : lfoManualTrig;
            if (lfoTriggered) {
                if (lfoDelaySec <= 0.005f) {
                    lfoEnv_ = 1.0f;
                } else {
                    lfoEnv_ = std::min(1.0f, lfoEnv_ + invSr / lfoDelaySec);
                }
            } else {
                lfoEnv_ = std::max(0.0f, lfoEnv_ - invSr * 8.0f);
            }
            float lfoOut = lfoTri * std::max(lfoEnv_, modWheel_);

            // 3. White noise PRNG
            noiseSeed_ = noiseSeed_ * 196314165u + 907633515u;
            float whiteNoise = (static_cast<float>(noiseSeed_ >> 9) / 4194304.0f) - 1.0f;

            float voiceSum = 0.0f;

            // 4. Synthesize 6 Polyphonic Voices
            for (int v = 0; v < kMaxVoices; ++v) {
                JunoVoice& voice = voices_[v];
                if (!voice.active) continue;

                // ADSR Envelope
                switch (voice.envStage) {
                    case EnvStage::Attack: {
                        voice.envLevel = 1.25f + (voice.envLevel - 1.25f) * attackCoef;
                        if (voice.envLevel >= 1.0f) {
                            voice.envLevel = 1.0f;
                            voice.envStage = EnvStage::Decay;
                        }
                        break;
                    }
                    case EnvStage::Decay: {
                        voice.envLevel = sustainLevel + (voice.envLevel - sustainLevel) * decayCoef;
                        if (std::fabs(voice.envLevel - sustainLevel) < 0.0005f) {
                            voice.envLevel = sustainLevel;
                            voice.envStage = EnvStage::Sustain;
                        }
                        break;
                    }
                    case EnvStage::Sustain: {
                        voice.envLevel = sustainLevel;
                        if (!voice.gate) {
                            voice.envStage = EnvStage::Release;
                        }
                        break;
                    }
                    case EnvStage::Release: {
                        voice.envLevel *= releaseCoef;
                        if (voice.envLevel < 0.0002f) {
                            voice.envLevel = 0.0f;
                            voice.envStage = EnvStage::Idle;
                        }
                        break;
                    }
                    case EnvStage::Idle:
                    default:
                        voice.envLevel = 0.0f;
                        break;
                }

                // Gate De-click Envelope
                float gateTarget = voice.gate ? 1.0f : 0.0f;
                voice.gateEnvLevel = gateTarget + (voice.gateEnvLevel - gateTarget) * gateCoef;

                float ampEnv = (vcaType == 0) ? voice.envLevel : voice.gateEnvLevel;
                if (ampEnv < 0.0002f && !voice.gate) {
                    voice.reset();
                    continue;
                }

                // DCO Pitch calculation
                float pitchSemis = static_cast<float>(voice.note)
                    + pitchBend_ * 7.0f
                    + lfoOut * pitchModDepth * 3.0f;
                float freq = 440.0f * std::pow(2.0f, (pitchSemis - 69.0f) / 12.0f) * rangeFactor;
                freq = clampf(freq, 16.0f, sr * 0.45f);
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
                    pwModSource = (lfoTri * 0.5f + 0.5f) * pwmDepth;
                } else {
                    pwModSource = voice.envLevel * pwmDepth;
                }
                float pw = clampf(0.5f + pwModSource * 0.45f, 0.05f, 0.95f);

                float pulse = (voice.phase < pw) ? 1.0f : -1.0f;
                pulse += polyBlep(voice.phase, dt);
                float phase2 = voice.phase - pw;
                if (phase2 < 0.0f) phase2 += 1.0f;
                pulse -= polyBlep(phase2, dt);

                // Sub-Oscillator (-1 octave square)
                float sub = voice.subFlip ? 1.0f : -1.0f;

                float dcoMix = saw * sawLevel * 0.45f
                             + pulse * pulseLevel * 0.45f
                             + sub * subLevel * 0.42f
                             + whiteNoise * noiseLevel * 0.35f;

                // 1-Pole High-Pass Filter (HPF)
                float hpfOut = hpfAlpha * (voice.hpfOutPrev + dcoMix - voice.hpfInPrev);
                voice.hpfInPrev = dcoMix;
                voice.hpfOutPrev = hpfOut;

                // 4-Pole 24dB/oct Resonant OTA VCF (IR3109 emulation)
                float baseCutCents = vcfCutoffParam * 11600.0f; // 20Hz .. ~16kHz
                float envModCents = vcfEnvParam * voice.envLevel * 8400.0f;
                float lfoModCents = vcfLfoParam * lfoOut * 3600.0f;
                float keyModCents = vcfKeyParam * (static_cast<float>(voice.note - 60) * 100.0f);
                float bendModCents = vcfBendParam * pitchBend_ * 2400.0f;

                float totalCents = baseCutCents + envModCents + lfoModCents + keyModCents + bendModCents;
                float cutFreq = 20.0f * std::pow(2.0f, totalCents / 1200.0f);
                cutFreq = clampf(cutFreq, 20.0f, sr * 0.42f);

                float g = std::tan(kPi * cutFreq * invSr);
                float G = g / (1.0f + g);
                float kRes = 3.85f * std::pow(vcfResParam, 1.15f);

                // Soft-saturated feedback path (OTA warmth)
                float feedbackSig = std::tanh(voice.z4 * 1.15f);
                float u = (hpfOut - kRes * feedbackSig) / (1.0f + kRes * G * G * G * G);

                voice.z1 += G * (std::tanh(u) - voice.z1);
                voice.z2 += G * (voice.z1 - voice.z2);
                voice.z3 += G * (voice.z2 - voice.z3);
                voice.z4 += G * (voice.z3 - voice.z4);

                float vcaGain = 0.15f + vcaDepth * 0.85f;
                float voiceSample = voice.z4 * ampEnv * vcaGain * voice.velocity;
                voiceSum += voiceSample;
            }

            // Normalize polyphonic bus & apply warm analog saturation
            float monoBus = std::tanh(voiceSum * 0.65f);

            // 5. Stereo BBD Chorus (Juno-60 I, II, I+II)
            float stereoL = monoBus;
            float stereoR = monoBus;

            if (chorusI || chorusII) {
                float chorusRateHz = (chorusI && chorusII) ? 0.95f : (chorusII ? 0.80f : 0.50f);
                float chorusDepthMs = (chorusI && chorusII) ? 2.6f : (chorusII ? 2.9f : 2.1f);
                float baseDelayMs = 3.4f;

                chorusPhase_ += chorusRateHz * invSr;
                if (chorusPhase_ >= 1.0f) chorusPhase_ -= 1.0f;
                float modTri = 4.0f * std::fabs(chorusPhase_ - 0.5f) - 1.0f;

                chorusDelayL_.write(monoBus);
                chorusDelayR_.write(monoBus);

                float delaySamplesL = (baseDelayMs + modTri * chorusDepthMs) * 0.001f * sr;
                float delaySamplesR = (baseDelayMs - modTri * chorusDepthMs) * 0.001f * sr;

                float wetL = chorusDelayL_.readInterpolated(delaySamplesL);
                float wetR = chorusDelayR_.readInterpolated(delaySamplesR);

                stereoL = monoBus * 0.65f + wetL * 0.55f;
                stereoR = monoBus * 0.65f + wetR * 0.55f;
            }

            // 6. Stereo Tape Echo Delay
            if (delayEnabled && delayMixParam > 0.001f) {
                float echoSecL = 0.06f + delayTimeParam * 0.84f;
                float echoSecR = echoSecL * 1.02f; // Subtle stereo ping-pong spread
                float echoSamplesL = echoSecL * sr;
                float echoSamplesR = echoSecR * sr;

                float delL = echoDelayL_.readInterpolated(echoSamplesL);
                float delR = echoDelayR_.readInterpolated(echoSamplesR);

                // Warm tape low-pass in feedback loop
                echoFilterL_ = delL * 0.65f + echoFilterL_ * 0.35f;
                echoFilterR_ = delR * 0.65f + echoFilterR_ * 0.35f;

                echoDelayL_.write(stereoL + echoFilterR_ * delayFeedbackParam);
                echoDelayR_.write(stereoR + echoFilterL_ * delayFeedbackParam);

                stereoL = stereoL * (1.0f - delayMixParam * 0.35f) + echoFilterL_ * delayMixParam;
                stereoR = stereoR * (1.0f - delayMixParam * 0.35f) + echoFilterR_ * delayMixParam;
            } else {
                echoDelayL_.write(0.0f);
                echoDelayR_.write(0.0f);
            }

            // 7. Global Post-Processing Stereo Reverb (Studio Plate & Concert Hall)
            if (reverbEnabled && reverbMixParam > 0.001f) {
                float revIn = (stereoL + stereoR) * 0.5f;
                reverbPreDelay_.write(revIn);
                float preDelayed = reverbPreDelay_.readInterpolated(preDelaySamples);

                // Early reflections diffusion
                float diffL = reverbDiffuser2L_.process(reverbDiffuser1L_.process(preDelayed));
                float diffR = reverbDiffuser2R_.process(reverbDiffuser1R_.process(preDelayed));

                float combSumL = 0.0f;
                float combSumR = 0.0f;
                for (int c = 0; c < 6; ++c) {
                    float cDelay = combBaseSec[c] * timeScale * sr;
                    float cIn = (c % 2 == 0) ? diffL : diffR;
                    float cOut = reverbCombs_[c].process(
                        cIn,
                        cDelay,
                        reverbFeedback,
                        reverbDamp,
                        reverbModDepthSamples,
                        reverbModInc * (1.0f + 0.07f * static_cast<float>(c))
                    );
                    if (c % 2 == 0) {
                        combSumL += cOut;
                    } else {
                        combSumR += cOut;
                    }
                }

                // Stereo cross-matrix for lush spatial tail
                float revOutL = (combSumL * 0.32f + combSumR * 0.14f);
                float revOutR = (combSumR * 0.32f + combSumL * 0.14f);

                float dryGain = 1.0f - reverbMixParam * 0.42f;
                float wetGain = reverbMixParam * 0.88f;

                stereoL = stereoL * dryGain + revOutL * wetGain;
                stereoR = stereoR * dryGain + revOutR * wetGain;
            }

            // 8. Master Volume & Output Soft-Clipper
            float outL = std::tanh(stereoL * masterVolume * 1.15f);
            float outR = std::tanh(stereoR * masterVolume * 1.15f);

            outInterleaved[frame * 2] = outL;
            outInterleaved[frame * 2 + 1] = outR;

            // 9. Write to Oscilloscope Ring Buffer (decimated every 4 samples for clear waveform view)
            scopeDecimator_++;
            if (scopeDecimator_ >= 4) {
                scopeDecimator_ = 0;
                int wPos = waveformWritePos_.load(std::memory_order_relaxed);
                waveformRing_[wPos] = (outL + outR) * 0.5f;
                waveformWritePos_.store((wPos + 1) % kWaveformBufferSize, std::memory_order_relaxed);
            }
        }
    }

private:
    void triggerVoiceOnLocked(int midiNote, float velocity) {
        // 1. Warm Retrigger: if this MIDI note is already playing on a voice, reuse it seamlessly
        for (int i = 0; i < kMaxVoices; ++i) {
            if (voices_[i].active && voices_[i].note == midiNote) {
                voices_[i].trigger(midiNote, velocity, true);
                return;
            }
        }

        // 2. Round-Robin search for next free or releasing voice
        for (int i = 0; i < kMaxVoices; ++i) {
            int idx = (nextVoiceIdx_ + i) % kMaxVoices;
            if (!voices_[idx].active || !voices_[idx].gate) {
                nextVoiceIdx_ = (idx + 1) % kMaxVoices;
                voices_[idx].trigger(midiNote, velocity, true);
                return;
            }
        }

        // 3. Steal oldest voice in Round-Robin order with Warm Retrigger (no click)
        int stealIdx = nextVoiceIdx_;
        nextVoiceIdx_ = (nextVoiceIdx_ + 1) % kMaxVoices;
        voices_[stealIdx].trigger(midiNote, velocity, true);
    }

    void triggerVoiceOffLocked(int midiNote) {
        for (int i = 0; i < kMaxVoices; ++i) {
            if (voices_[i].active && voices_[i].note == midiNote && voices_[i].gate) {
                voices_[i].releaseNote();
            }
        }
    }

    void advanceArpeggiatorStepLocked() {
        if (heldNotes_.empty()) return;

        // Build expanded arpeggio sequence across octaves
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
            triggerVoiceOffLocked(arpCurrentNote_);
        }

        int idx = arpStepIndex_ % static_cast<int>(sequence.size());
        arpCurrentNote_ = sequence[idx];
        arpStepIndex_ = (arpStepIndex_ + 1) % static_cast<int>(sequence.size());
        triggerVoiceOnLocked(arpCurrentNote_, 0.9f);
    }

    mutable std::mutex mutex_;
    float sampleRate_ = 48000.0f;
    std::array<float, ParamCount> params_{};
    std::array<JunoVoice, kMaxVoices> voices_{};
    int nextVoiceIdx_ = 0;

    float pitchBend_ = 0.0f;
    float modWheel_ = 0.0f;

    // LFO state
    float lfoPhase_ = 0.0f;
    float lfoEnv_ = 0.0f;

    // Noise PRNG
    uint32_t noiseSeed_ = 22222u;

    // Arpeggiator state
    bool arpEnabled_ = false;
    float arpMode_ = 0.0f; // 0=UP, 1=UP/DOWN, 2=DOWN
    int arpRange_ = 1;
    float arpBpm_ = 120.0f;
    int arpRateDiv_ = 8;
    float arpSampleCounter_ = 0.0f;
    int arpStepIndex_ = 0;
    int arpCurrentNote_ = -1;
    std::vector<int> heldNotes_;

    // Stereo BBD Chorus state
    float chorusPhase_ = 0.0f;
    DelayLine chorusDelayL_;
    DelayLine chorusDelayR_;

    // Stereo Echo Delay state
    DelayLine echoDelayL_;
    DelayLine echoDelayR_;
    float echoFilterL_ = 0.0f;
    float echoFilterR_ = 0.0f;

    // Global Post-Processing Stereo Reverb (Plate & Hall)
    DelayLine reverbPreDelay_;
    AllpassFilter reverbDiffuser1L_;
    AllpassFilter reverbDiffuser2L_;
    AllpassFilter reverbDiffuser1R_;
    AllpassFilter reverbDiffuser2R_;
    std::array<ModulatedDampedComb, 6> reverbCombs_;

    // Oscilloscope Ring Buffer
    std::array<float, kWaveformBufferSize> waveformRing_{};
    std::atomic<int> waveformWritePos_{0};
    int scopeDecimator_ = 0;
};

} // namespace hera
