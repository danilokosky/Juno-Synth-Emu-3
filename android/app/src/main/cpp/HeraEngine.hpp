#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>

namespace hera {

constexpr int MAX_VOICES = 6;
constexpr float PI = 3.14159265358979323846f;
constexpr float TWO_PI = 2.0f * PI;

enum DcoRange { RANGE_16 = 0, RANGE_8 = 1, RANGE_4 = 2 };
enum PwmModSource { PWM_MANUAL = 0, PWM_LFO = 1, PWM_ENV = 2 };
enum LfoTrigMode { LFO_MANUAL = 0, LFO_AUTO = 1 };
enum VcaType { VCA_ENV = 0, VCA_GATE = 1 };

// Fast rational approximation of tanh for analog saturation (4x faster than std::tanh)
static inline float fast_tanh(float x) {
    if (x < -3.0f) return -1.0f;
    if (x > 3.0f) return 1.0f;
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

// Anti-aliased PolyBLEP residual
static inline float poly_blep(float t, float dt) {
    if (dt <= 0.0f) return 0.0f;
    if (t < dt) {
        float x = t / dt;
        return x + x - x * x - 1.0f;
    } else if (t > 1.0f - dt) {
        float x = (t - 1.0f) / dt;
        return x * x + x + x + 1.0f;
    }
    return 0.0f;
}

struct Parameters {
    // DCO
    int dcoRange = RANGE_8;
    int lfoTrigMode = LFO_AUTO;
    int pwmModSource = PWM_LFO;
    float dcoPitchMod = 0.0f;
    float dcoPwmDepth = 0.5f;
    float dcoPulseLevel = 0.0f;
    float dcoSawLevel = 1.0f;
    float dcoSubLevel = 0.5f;
    float dcoNoiseLevel = 0.0f;

    // HPF
    float hpf = 0.0f;

    // VCF
    float vcfCutoff = 0.65f;
    float vcfResonance = 0.15f;
    float vcfEnvMod = 0.0f;   // -1.0 to 1.0
    float vcfLfoMod = 0.0f;
    float vcfKeyFollow = 0.8f;
    float vcfBendDepth = 0.0f;

    // LFO
    float lfoRate = 0.5f;
    float lfoDelay = 0.0f;

    // VCA
    int vcaType = VCA_ENV;
    float vcaDepth = 0.75f;

    // ENV
    float envAttack = 0.05f;
    float envDecay = 0.25f;
    float envSustain = 0.8f;
    float envRelease = 0.35f;

    // CHORUS
    bool chorusI = true;
    bool chorusII = false;
};

class Voice {
public:
    int note = -1;
    float baseFreq = 440.0f;
    float phase = 0.0f;
    float phaseInc = 0.0f;
    float subPhase = 0.0f;
    bool active = false;
    bool released = true;
    uint32_t age = 0;

    // Envelope
    int envStage = 0; // 0: idle, 1: A, 2: D, 3: S, 4: R
    float envLevel = 0.0f;

    // 4-Pole OTA Lowpass Filter Stages
    float filterStages[4] = {0.0f, 0.0f, 0.0f, 0.0f};

    void start(int midiNote, float vel, float sampleRate, const Parameters& params, uint32_t currentAge) {
        note = midiNote;
        active = true;
        released = false;
        envStage = 1; // Attack
        age = currentAge;

        float rangeFactor = (params.dcoRange == RANGE_16) ? 0.5f : ((params.dcoRange == RANGE_4) ? 2.0f : 1.0f);
        baseFreq = 440.0f * std::pow(2.0f, (midiNote - 69.0f) / 12.0f) * rangeFactor;
        phaseInc = std::clamp(baseFreq / sampleRate, 0.0001f, 0.45f);

        // Don't fully clear filter states if retriggering to avoid sudden pop clicks
        for (int i = 0; i < 4; ++i) filterStages[i] *= 0.5f;
    }

    void release() {
        if (active && !released) {
            released = true;
            envStage = 4; // Release
        }
    }

    void stop() {
        active = false;
        released = true;
        envStage = 0;
        envLevel = 0.0f;
        note = -1;
    }
};

class HeraEngine {
public:
    HeraEngine() {
        init(48000.0f);
    }

    void init(float sr) {
        sampleRate = sr > 8000.0f ? sr : 48000.0f;
        invSampleRate = 1.0f / sampleRate;
        std::memset(chorusBufferL, 0, sizeof(chorusBufferL));
        std::memset(chorusBufferR, 0, sizeof(chorusBufferR));
        chorusWriteIndex = 0;
        lfoPhase = 0.0f;
        chorusLfoPhase = 0.0f;
        hpfZ1 = 0.0f;
        globalAge = 0;

        for (int i = 0; i < MAX_VOICES; ++i) {
            voices[i].stop();
        }
    }

    void noteOn(int note, float velocity) {
        globalAge++;
        // 1. Re-use existing voice for same note
        int target = -1;
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (voices[i].active && voices[i].note == note) {
                target = i;
                break;
            }
        }
        // 2. Find idle voice
        if (target == -1) {
            for (int i = 0; i < MAX_VOICES; ++i) {
                if (!voices[i].active) {
                    target = i;
                    break;
                }
            }
        }
        // 3. Find oldest released voice
        if (target == -1) {
            uint32_t oldestAge = UINT32_MAX;
            for (int i = 0; i < MAX_VOICES; ++i) {
                if (voices[i].released && voices[i].age < oldestAge) {
                    oldestAge = voices[i].age;
                    target = i;
                }
            }
        }
        // 4. Steal oldest active voice
        if (target == -1) {
            uint32_t oldestAge = UINT32_MAX;
            for (int i = 0; i < MAX_VOICES; ++i) {
                if (voices[i].age < oldestAge) {
                    oldestAge = voices[i].age;
                    target = i;
                }
            }
        }
        if (target == -1) target = 0;

        voices[target].start(note, velocity, sampleRate, params, globalAge);
    }

    void noteOff(int note) {
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (voices[i].active && voices[i].note == note) {
                voices[i].release();
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < MAX_VOICES; ++i) {
            voices[i].stop();
        }
    }

    void setPitchBend(float normalized) {
        pitchBendSemitones = std::clamp(normalized, -1.0f, 1.0f) * 2.0f;
    }

    void setModWheel(float normalized) {
        modWheel = std::clamp(normalized, 0.0f, 1.0f);
    }

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case 0: params.dcoRange = std::clamp(static_cast<int>(value), 0, 2); break;
            case 1: params.lfoTrigMode = (value >= 0.5f) ? 1 : 0; break;
            case 2: params.pwmModSource = std::clamp(static_cast<int>(value), 0, 2); break;
            case 3: params.dcoPitchMod = std::clamp(value, 0.0f, 1.0f); break;
            case 4: params.dcoPwmDepth = std::clamp(value, 0.0f, 1.0f); break;
            case 5: params.dcoPulseLevel = std::clamp(value, 0.0f, 1.0f); break;
            case 6: params.dcoSawLevel = std::clamp(value, 0.0f, 1.0f); break;
            case 7: params.dcoSubLevel = std::clamp(value, 0.0f, 1.0f); break;
            case 8: params.dcoNoiseLevel = std::clamp(value, 0.0f, 1.0f); break;
            case 9: params.hpf = std::clamp(value, 0.0f, 1.0f); break;
            case 10: params.vcfCutoff = std::clamp(value, 0.0f, 1.0f); break;
            case 11: params.vcfResonance = std::clamp(value, 0.0f, 1.0f); break;
            case 12: params.vcfEnvMod = std::clamp(value, -1.0f, 1.0f); break;
            case 13: params.vcfLfoMod = std::clamp(value, 0.0f, 1.0f); break;
            case 14: params.vcfKeyFollow = std::clamp(value, 0.0f, 1.0f); break;
            case 15: params.vcfBendDepth = std::clamp(value, 0.0f, 1.0f); break;
            case 16: params.lfoRate = std::clamp(value, 0.0f, 1.0f); break;
            case 17: params.lfoDelay = std::clamp(value, 0.0f, 1.0f); break;
            case 18: params.vcaType = (value >= 0.5f) ? 1 : 0; break;
            case 19: params.vcaDepth = std::clamp(value, 0.0f, 1.0f); break;
            case 20: params.envAttack = std::clamp(value, 0.0f, 1.0f); break;
            case 21: params.envDecay = std::clamp(value, 0.0f, 1.0f); break;
            case 22: params.envSustain = std::clamp(value, 0.0f, 1.0f); break;
            case 23: params.envRelease = std::clamp(value, 0.0f, 1.0f); break;
            case 24: params.chorusI = (value > 0.5f); break;
            case 25: params.chorusII = (value > 0.5f); break;
        }
    }

    Parameters& getParams() { return params; }

    void render(float* outputL, float* outputR, int numFrames) {
        float lfoFreq = 0.3f + 20.0f * (params.lfoRate * params.lfoRate);
        float lfoInc = lfoFreq * invSampleRate;

        // Chorus rates: Mode I = 0.513Hz, Mode II = 0.863Hz, Mode I+II = 9.75Hz
        float chorusRate = 0.513f;
        if (params.chorusI && params.chorusII) chorusRate = 9.75f;
        else if (params.chorusII) chorusRate = 0.863f;
        float chorusLfoInc = chorusRate * invSampleRate;

        // Exponential analog time constants
        float attackSec = 0.002f + 2.5f * (params.envAttack * params.envAttack);
        float decaySec = 0.005f + 4.0f * (params.envDecay * params.envDecay);
        float releaseSec = 0.005f + 5.0f * (params.envRelease * params.envRelease);

        // Pre-calculate polyphony headroom scale (prevents clipping with 6 active voices)
        constexpr float POLY_HEADROOM = 0.38f;

        for (int f = 0; f < numFrames; ++f) {
            lfoPhase += lfoInc;
            if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
            float lfoVal = std::sin(TWO_PI * lfoPhase);

            float voiceMixSum = 0.0f;

            for (int v = 0; v < MAX_VOICES; ++v) {
                Voice& voice = voices[v];
                if (!voice.active) continue;

                // ADSR Envelope processing
                if (params.vcaType == VCA_GATE) {
                    if (voice.released) {
                        voice.envLevel -= invSampleRate * 100.0f; // Quick anti-click fadeout
                        if (voice.envLevel <= 0.0f) {
                            voice.stop();
                            continue;
                        }
                    } else {
                        voice.envLevel = std::min(1.0f, voice.envLevel + invSampleRate * 200.0f);
                    }
                } else {
                    if (voice.envStage == 1) { // Attack
                        voice.envLevel += invSampleRate / attackSec;
                        if (voice.envLevel >= 1.0f) {
                            voice.envLevel = 1.0f;
                            voice.envStage = 2; // Decay
                        }
                    } else if (voice.envStage == 2) { // Decay
                        voice.envLevel -= (invSampleRate / decaySec) * (1.0f - params.envSustain);
                        if (voice.envLevel <= params.envSustain) {
                            voice.envLevel = params.envSustain;
                            voice.envStage = 3; // Sustain
                        }
                    } else if (voice.envStage == 4) { // Release
                        voice.envLevel -= invSampleRate / releaseSec;
                        if (voice.envLevel <= 0.0001f) {
                            voice.stop();
                            continue;
                        }
                    }
                }

                // DCO Pitch Modulation
                float pitchModVal = (pitchBendSemitones + lfoVal * params.dcoPitchMod * 2.0f) / 12.0f;
                float curInc = voice.phaseInc * std::pow(2.0f, pitchModVal);
                curInc = std::clamp(curInc, 0.0001f, 0.45f);

                voice.phase += curInc;
                if (voice.phase >= 1.0f) voice.phase -= 1.0f;

                // Anti-aliased PolyBLEP Sawtooth
                float saw = (2.0f * voice.phase - 1.0f) - poly_blep(voice.phase, curInc);

                // Pulse with PWM
                float pwmWidth = 0.5f;
                if (params.pwmModSource == PWM_LFO) {
                    pwmWidth = 0.5f + 0.45f * params.dcoPwmDepth * lfoVal;
                } else if (params.pwmModSource == PWM_ENV) {
                    pwmWidth = 0.5f + 0.45f * params.dcoPwmDepth * (voice.envLevel * 2.0f - 1.0f);
                } else {
                    pwmWidth = 0.5f + 0.45f * (params.dcoPwmDepth * 2.0f - 1.0f);
                }
                pwmWidth = std::clamp(pwmWidth, 0.05f, 0.95f);

                float pulse = (voice.phase < pwmWidth ? 1.0f : -1.0f);
                pulse += poly_blep(voice.phase, curInc);
                float t2 = voice.phase - pwmWidth;
                if (t2 < 0.0f) t2 += 1.0f;
                pulse -= poly_blep(t2, curInc);

                // Sub-oscillator (-1 octave square)
                voice.subPhase += curInc * 0.5f;
                if (voice.subPhase >= 1.0f) voice.subPhase -= 1.0f;
                float sub = (voice.subPhase < 0.5f) ? 1.0f : -1.0f;

                // White / pink noise
                noiseSeed = 1664525u * noiseSeed + 1013904223u;
                float noise = (static_cast<float>(noiseSeed) * 4.6566129e-10f - 1.0f) * 0.5f;

                float oscMix = (saw * params.dcoSawLevel) +
                               (pulse * params.dcoPulseLevel) +
                               (sub * params.dcoSubLevel * 0.7f) +
                               (noise * params.dcoNoiseLevel * 0.4f);

                // VCF 4-Pole Lowpass Filter (cascaded OTA with analog tanh saturation)
                float cutoffOctaves = params.vcfCutoff * 12.0f;
                float envDetune = params.vcfEnvMod * voice.envLevel * 6.0f;
                float lfoDetune = params.vcfLfoMod * lfoVal * 2.0f;
                float keyDetune = params.vcfKeyFollow * ((voice.note - 60) / 12.0f);
                float bendDetune = params.vcfBendDepth * (pitchBendSemitones / 12.0f);

                float fc = 20.0f * std::pow(2.0f, cutoffOctaves + envDetune + lfoDetune + keyDetune + bendDetune);
                fc = std::clamp(fc, 10.0f, sampleRate * 0.45f);

                // Bilinear transform pole frequency
                float g = std::tan(PI * fc * invSampleRate);
                g = std::clamp(g, 0.0001f, 0.999f);
                float k = params.vcfResonance * 3.85f;

                float u = oscMix - k * voice.filterStages[3];
                u = fast_tanh(u);

                for (int s = 0; s < 4; ++s) {
                    float prev = (s == 0) ? u : voice.filterStages[s - 1];
                    voice.filterStages[s] += g * (prev - voice.filterStages[s]);
                }

                voiceMixSum += voice.filterStages[3] * voice.envLevel;
            }

            // Headroom scaling
            voiceMixSum *= POLY_HEADROOM;

            // HPF Filter (stepped Juno curve)
            float hpfOut = voiceMixSum;
            if (params.hpf > 0.05f) {
                float hpfCut = 120.0f * std::pow(2.5f, params.hpf * 3.0f);
                float hpfG = std::clamp(2.0f * PI * hpfCut * invSampleRate, 0.001f, 0.9f);
                hpfZ1 += hpfG * (voiceMixSum - hpfZ1);
                hpfOut = voiceMixSum - hpfZ1;
            }

            // VCA Master & smooth saturation (prevents harsh DAC digital clipping)
            float vcaOut = fast_tanh(hpfOut * params.vcaDepth * 1.5f);

            // Roland Stereo BBD Chorus (Dual Anti-phase Delay Lines)
            bool chorusActive = params.chorusI || params.chorusII;
            if (chorusActive) {
                chorusBufferL[chorusWriteIndex] = vcaOut;
                chorusBufferR[chorusWriteIndex] = vcaOut;

                chorusLfoPhase += chorusLfoInc;
                if (chorusLfoPhase >= 1.0f) chorusLfoPhase -= 1.0f;
                float cLfo = std::sin(TWO_PI * chorusLfoPhase);

                float delayL = (0.0035f + cLfo * 0.0018f) * sampleRate;
                float delayR = (0.0035f - cLfo * 0.0018f) * sampleRate; // 180° anti-phase stereo

                int idxL = (chorusWriteIndex - static_cast<int>(delayL) + 4096) & 4095;
                int idxR = (chorusWriteIndex - static_cast<int>(delayR) + 4096) & 4095;

                // 50% dry / 50% wet classic Roland BBD mix
                float outL = 0.6f * vcaOut + 0.5f * chorusBufferL[idxL];
                float outR = 0.6f * vcaOut + 0.5f * chorusBufferR[idxR];

                outputL[f] = fast_tanh(outL);
                outputR[f] = fast_tanh(outR);

                chorusWriteIndex = (chorusWriteIndex + 1) & 4095;
            } else {
                outputL[f] = vcaOut;
                outputR[f] = vcaOut;
            }
        }
    }

private:
    float sampleRate = 48000.0f;
    float invSampleRate = 1.0f / 48000.0f;
    Parameters params;
    Voice voices[MAX_VOICES];
    uint32_t globalAge = 0;

    float lfoPhase = 0.0f;
    float pitchBendSemitones = 0.0f;
    float modWheel = 0.0f;
    uint32_t noiseSeed = 123456789u;

    float hpfZ1 = 0.0f;

    float chorusBufferL[4096];
    float chorusBufferR[4096];
    int chorusWriteIndex = 0;
    float chorusLfoPhase = 0.0f;
};

} // namespace hera
