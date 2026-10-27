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

struct Parameters {
    // DCO
    int dcoRange = RANGE_8;
    int lfoTrigMode = LFO_AUTO;
    int pwmModSource = PWM_LFO;
    float dcoPitchMod = 0.0f;
    float dcoPwmDepth = 0.0f;
    float dcoPulseLevel = 0.0f;
    float dcoSawLevel = 1.0f;
    float dcoSubLevel = 0.0f;
    float dcoNoiseLevel = 0.0f;

    // HPF
    float hpf = 0.0f;

    // VCF
    float vcfCutoff = 0.7f;
    float vcfResonance = 0.0f;
    float vcfEnvMod = 0.0f;   // -1.0 to 1.0
    float vcfLfoMod = 0.0f;
    float vcfKeyFollow = 1.0f;
    float vcfBendDepth = 0.0f;

    // LFO
    float lfoRate = 0.6f;
    float lfoDelay = 0.0f;

    // VCA
    int vcaType = VCA_ENV;
    float vcaDepth = 0.8f;

    // ENV
    float envAttack = 0.35f;
    float envDecay = 0.1f;
    float envSustain = 1.0f;
    float envRelease = 0.45f;

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

    // Envelope
    int envStage = 0; // 0: idle, 1: A, 2: D, 3: S, 4: R
    float envLevel = 0.0f;

    // 4-Pole OTA Lowpass Filter Stages
    float filterStages[4] = {0.0f, 0.0f, 0.0f, 0.0f};

    void start(int midiNote, float vel, float sampleRate, const Parameters& params) {
        note = midiNote;
        active = true;
        released = false;
        envStage = 1; // Attack
        envLevel = 0.0f;

        float rangeFactor = (params.dcoRange == RANGE_16) ? 0.5f : ((params.dcoRange == RANGE_4) ? 2.0f : 1.0f);
        baseFreq = 440.0f * std::pow(2.0f, (midiNote - 69.0f) / 12.0f) * rangeFactor;
        phaseInc = baseFreq / sampleRate;

        for (int i = 0; i < 4; ++i) filterStages[i] = 0.0f;
    }

    void release() {
        if (active) {
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
        sampleRate = sr;
        invSampleRate = 1.0f / sr;
        std::memset(chorusBufferL, 0, sizeof(chorusBufferL));
        std::memset(chorusBufferR, 0, sizeof(chorusBufferR));
        chorusWriteIndex = 0;
        lfoPhase = 0.0f;
        chorusLfoPhase = 0.0f;
        hpfZ1 = 0.0f;

        for (int i = 0; i < MAX_VOICES; ++i) {
            voices[i].stop();
        }
    }

    void noteOn(int note, float velocity) {
        // Find existing or free voice
        int target = -1;
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (voices[i].active && voices[i].note == note) {
                target = i;
                break;
            }
        }
        if (target == -1) {
            for (int i = 0; i < MAX_VOICES; ++i) {
                if (!voices[i].active) {
                    target = i;
                    break;
                }
            }
        }
        // Voice stealing
        if (target == -1) {
            for (int i = 0; i < MAX_VOICES; ++i) {
                if (voices[i].released) {
                    target = i;
                    break;
                }
            }
        }
        if (target == -1) target = 0;

        voices[target].start(note, velocity, sampleRate, params);
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
        pitchBendSemitones = normalized * 2.0f;
    }

    void setModWheel(float normalized) {
        modWheel = normalized;
    }

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case 0: params.dcoRange = static_cast<int>(value); break;
            case 1: params.lfoTrigMode = static_cast<int>(value); break;
            case 2: params.pwmModSource = static_cast<int>(value); break;
            case 3: params.dcoPitchMod = value; break;
            case 4: params.dcoPwmDepth = value; break;
            case 5: params.dcoPulseLevel = value; break;
            case 6: params.dcoSawLevel = value; break;
            case 7: params.dcoSubLevel = value; break;
            case 8: params.dcoNoiseLevel = value; break;
            case 9: params.hpf = value; break;
            case 10: params.vcfCutoff = value; break;
            case 11: params.vcfResonance = value; break;
            case 12: params.vcfEnvMod = value; break;
            case 13: params.vcfLfoMod = value; break;
            case 14: params.vcfKeyFollow = value; break;
            case 15: params.vcfBendDepth = value; break;
            case 16: params.lfoRate = value; break;
            case 17: params.lfoDelay = value; break;
            case 18: params.vcaType = static_cast<int>(value); break;
            case 19: params.vcaDepth = value; break;
            case 20: params.envAttack = value; break;
            case 21: params.envDecay = value; break;
            case 22: params.envSustain = value; break;
            case 23: params.envRelease = value; break;
            case 24: params.chorusI = (value > 0.5f); break;
            case 25: params.chorusII = (value > 0.5f); break;
        }
    }

    Parameters& getParams() { return params; }

    void render(float* outputL, float* outputR, int numFrames) {
        float lfoFreq = 0.3f + 21.8f * std::pow(params.lfoRate, 2.86f);
        float lfoInc = lfoFreq * invSampleRate;

        // Chorus rates: Mode I = 0.513Hz, Mode II = 0.863Hz, Mode I+II = 9.75Hz
        float chorusRate = 0.513f;
        if (params.chorusI && params.chorusII) chorusRate = 9.75f;
        else if (params.chorusII) chorusRate = 0.863f;
        float chorusLfoInc = chorusRate * invSampleRate;

        float attackSec = 0.0099f * std::exp(5.8f * params.envAttack);
        float decaySec = 0.0495f * std::exp(6.0f * params.envDecay);
        float releaseSec = 0.0495f * std::exp(6.0f * params.envRelease);

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
                    voice.envLevel = voice.released ? 0.0f : 1.0f;
                    if (voice.released) voice.active = false;
                } else {
                    if (voice.envStage == 1) { // Attack
                        voice.envLevel += invSampleRate / std::max(0.001f, attackSec);
                        if (voice.envLevel >= 1.0f) {
                            voice.envLevel = 1.0f;
                            voice.envStage = 2; // Decay
                        }
                    } else if (voice.envStage == 2) { // Decay
                        voice.envLevel -= (invSampleRate / std::max(0.002f, decaySec)) * (1.0f - params.envSustain);
                        if (voice.envLevel <= params.envSustain) {
                            voice.envLevel = params.envSustain;
                            voice.envStage = 3; // Sustain
                        }
                    } else if (voice.envStage == 4) { // Release
                        voice.envLevel -= invSampleRate / std::max(0.002f, releaseSec);
                        if (voice.envLevel <= 0.0f) {
                            voice.envLevel = 0.0f;
                            voice.active = false;
                            continue;
                        }
                    }
                }

                // DCO Pitch Modulation
                float pitchModFactor = std::pow(2.0f, (pitchBendSemitones + lfoVal * params.dcoPitchMod * 2.0f) / 12.0f);
                float curInc = voice.phaseInc * pitchModFactor;

                voice.phase += curInc;
                if (voice.phase >= 1.0f) voice.phase -= 1.0f;

                // Anti-aliased PolyBLEP Sawtooth
                float saw = (2.0f * voice.phase - 1.0f);
                if (voice.phase < curInc) {
                    float t = voice.phase / curInc;
                    saw -= (t + t - t * t - 1.0f);
                } else if (voice.phase > 1.0f - curInc) {
                    float t = (voice.phase - 1.0f) / curInc;
                    saw -= (t * t + t + t + 1.0f);
                }

                // Sub-oscillator (-1 octave square)
                voice.subPhase += curInc * 0.5f;
                if (voice.subPhase >= 1.0f) voice.subPhase -= 1.0f;
                float sub = (voice.subPhase < 0.5f) ? 1.0f : -1.0f;

                // Simple pink-like noise generator
                noiseSeed = 1664525 * noiseSeed + 1013904223;
                float noise = (static_cast<float>(noiseSeed) / 2147483648.0f - 1.0f) * 0.5f;

                float oscOut = saw * params.dcoSawLevel + sub * params.dcoSubLevel + noise * params.dcoNoiseLevel;

                // VCF 4-Pole Lowpass Filter
                float cutoffOctaves = params.vcfCutoff * (200.0f / 12.0f);
                float envDetune = params.vcfEnvMod * voice.envLevel * 12.0f;
                float lfoDetune = params.vcfLfoMod * lfoVal * 3.0f;
                float keyDetune = params.vcfKeyFollow * ((voice.note - 60) / 12.0f);
                float bendDetune = params.vcfBendDepth * (pitchBendSemitones / 12.0f);

                float fc = 7.8f * std::pow(2.0f, cutoffOctaves + envDetune + lfoDetune + keyDetune + bendDetune);
                fc = std::clamp(fc, 20.0f, 20000.0f);

                float g = std::tan(PI * fc * invSampleRate);
                float k = params.vcfResonance * 3.9f;

                float u = std::tanh(oscOut - k * voice.filterStages[3]);
                for (int s = 0; s < 4; ++s) {
                    float prev = (s == 0) ? u : voice.filterStages[s - 1];
                    voice.filterStages[s] += g * (prev - voice.filterStages[s]);
                }

                voiceMixSum += voice.filterStages[3] * voice.envLevel;
            }

            // HPF Filter
            float hpfOut = voiceMixSum;
            if (params.hpf > 0.05f) {
                float hpfCut = 68.53f * std::exp(4.065f * params.hpf) + 72.63f;
                float hpfG = std::min(1.0f, 2.0f * PI * hpfCut * invSampleRate);
                hpfZ1 += hpfG * (voiceMixSum - hpfZ1);
                hpfOut = voiceMixSum - hpfZ1;
            }

            // VCA Master & Tanh soft clip
            float vcaOut = std::tanh(hpfOut * params.vcaDepth);

            // Roland Stereo BBD Chorus
            bool chorusActive = params.chorusI || params.chorusII;
            if (chorusActive) {
                chorusBufferL[chorusWriteIndex] = vcaOut;
                chorusBufferR[chorusWriteIndex] = vcaOut;

                chorusLfoPhase += chorusLfoInc;
                if (chorusLfoPhase >= 1.0f) chorusLfoPhase -= 1.0f;
                float cLfo = std::sin(TWO_PI * chorusLfoPhase);

                float delayL = (0.00335f + cLfo * 0.0018f) * sampleRate;
                float delayR = (0.00345f - cLfo * 0.0019f) * sampleRate; // 180° antiphase

                int idxL = (chorusWriteIndex - static_cast<int>(delayL) + 4096) % 4096;
                int idxR = (chorusWriteIndex - static_cast<int>(delayR) + 4096) % 4096;

                outputL[f] = 0.7f * vcaOut + 0.7f * chorusBufferL[idxL];
                outputR[f] = 0.7f * vcaOut + 0.7f * chorusBufferR[idxR];

                chorusWriteIndex = (chorusWriteIndex + 1) % 4096;
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

    float lfoPhase = 0.0f;
    float pitchBendSemitones = 0.0f;
    float modWheel = 0.0f;
    uint32_t noiseSeed = 123456789;

    float hpfZ1 = 0.0f;

    float chorusBufferL[4096];
    float chorusBufferR[4096];
    int chorusWriteIndex = 0;
    float chorusLfoPhase = 0.0f;
};

} // namespace hera
