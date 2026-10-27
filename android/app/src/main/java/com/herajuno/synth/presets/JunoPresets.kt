package com.herajuno.synth.presets

import com.herajuno.synth.midi.MidiParams

data class JunoPreset(
    val name: String,
    val bank: Int,
    val patch: Int,
    val params: Map<Int, Float>
)

object JunoPresets {
    val factoryPresets: List<JunoPreset> = listOf(
        JunoPreset("Strings 1", 1, 1, mapOf(
            MidiParams.DCO_RANGE to 1f, // 8'
            MidiParams.DCO_SAW_LEVEL to 1f,
            MidiParams.DCO_PULSE_LEVEL to 0f,
            MidiParams.DCO_SUB_LEVEL to 0.4f,
            MidiParams.DCO_NOISE_LEVEL to 0f,
            MidiParams.HPF to 0.1f,
            MidiParams.VCF_CUTOFF to 0.65f,
            MidiParams.VCF_RESONANCE to 0.1f,
            MidiParams.VCF_ENV_MOD to 0.2f,
            MidiParams.VCF_KEY_FOLLOW to 0.8f,
            MidiParams.VCA_TYPE to 0f, // ENV
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.35f,
            MidiParams.ENV_DECAY to 0.2f,
            MidiParams.ENV_SUSTAIN to 0.9f,
            MidiParams.ENV_RELEASE to 0.45f,
            MidiParams.CHORUS_I to 1f,
            MidiParams.CHORUS_II to 0f
        )),
        JunoPreset("Strings 2", 1, 2, mapOf(
            MidiParams.DCO_RANGE to 1f,
            MidiParams.DCO_SAW_LEVEL to 1f,
            MidiParams.DCO_PULSE_LEVEL to 0.6f,
            MidiParams.DCO_PWM_DEPTH to 0.7f,
            MidiParams.PWM_MOD to 1f, // LFO
            MidiParams.DCO_SUB_LEVEL to 0.5f,
            MidiParams.VCF_CUTOFF to 0.55f,
            MidiParams.VCF_RESONANCE to 0.15f,
            MidiParams.VCA_TYPE to 0f,
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.45f,
            MidiParams.ENV_DECAY to 0.3f,
            MidiParams.ENV_SUSTAIN to 1f,
            MidiParams.ENV_RELEASE to 0.55f,
            MidiParams.CHORUS_I to 0f,
            MidiParams.CHORUS_II to 1f
        )),
        JunoPreset("Brass 1", 1, 3, mapOf(
            MidiParams.DCO_RANGE to 1f,
            MidiParams.DCO_SAW_LEVEL to 1f,
            MidiParams.DCO_SUB_LEVEL to 0.3f,
            MidiParams.VCF_CUTOFF to 0.42f,
            MidiParams.VCF_RESONANCE to 0.3f,
            MidiParams.VCF_ENV_MOD to 0.65f,
            MidiParams.VCF_KEY_FOLLOW to 0.7f,
            MidiParams.VCA_TYPE to 0f,
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.15f,
            MidiParams.ENV_DECAY to 0.4f,
            MidiParams.ENV_SUSTAIN to 0.65f,
            MidiParams.ENV_RELEASE to 0.25f,
            MidiParams.CHORUS_I to 1f,
            MidiParams.CHORUS_II to 0f
        )),
        JunoPreset("Synth Bass", 1, 4, mapOf(
            MidiParams.DCO_RANGE to 0f, // 16'
            MidiParams.DCO_SAW_LEVEL to 0.9f,
            MidiParams.DCO_SUB_LEVEL to 0.9f,
            MidiParams.VCF_CUTOFF to 0.35f,
            MidiParams.VCF_RESONANCE to 0.45f,
            MidiParams.VCF_ENV_MOD to 0.5f,
            MidiParams.VCF_KEY_FOLLOW to 0.5f,
            MidiParams.VCA_TYPE to 0f,
            MidiParams.VCA_DEPTH to 0.9f,
            MidiParams.ENV_ATTACK to 0.01f,
            MidiParams.ENV_DECAY to 0.35f,
            MidiParams.ENV_SUSTAIN to 0.2f,
            MidiParams.ENV_RELEASE to 0.15f,
            MidiParams.CHORUS_I to 0f,
            MidiParams.CHORUS_II to 0f
        )),
        JunoPreset("Organ 1", 1, 5, mapOf(
            MidiParams.DCO_RANGE to 1f,
            MidiParams.DCO_SAW_LEVEL to 0f,
            MidiParams.DCO_PULSE_LEVEL to 1f,
            MidiParams.DCO_PWM_DEPTH to 0.5f,
            MidiParams.DCO_SUB_LEVEL to 0.8f,
            MidiParams.VCF_CUTOFF to 0.85f,
            MidiParams.VCF_RESONANCE to 0f,
            MidiParams.VCA_TYPE to 1f, // GATE
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.01f,
            MidiParams.ENV_DECAY to 0.1f,
            MidiParams.ENV_SUSTAIN to 1f,
            MidiParams.ENV_RELEASE to 0.05f,
            MidiParams.CHORUS_I to 1f,
            MidiParams.CHORUS_II to 1f // Rotary Chorus I + II
        )),
        JunoPreset("Piano 1", 1, 6, mapOf(
            MidiParams.DCO_RANGE to 1f,
            MidiParams.DCO_SAW_LEVEL to 0.7f,
            MidiParams.DCO_PULSE_LEVEL to 0.7f,
            MidiParams.DCO_PWM_DEPTH to 0.4f,
            MidiParams.DCO_SUB_LEVEL to 0.3f,
            MidiParams.VCF_CUTOFF to 0.6f,
            MidiParams.VCF_RESONANCE to 0.1f,
            MidiParams.VCF_ENV_MOD to 0.4f,
            MidiParams.VCF_KEY_FOLLOW to 0.9f,
            MidiParams.VCA_TYPE to 0f,
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.02f,
            MidiParams.ENV_DECAY to 0.55f,
            MidiParams.ENV_SUSTAIN to 0f,
            MidiParams.ENV_RELEASE to 0.25f,
            MidiParams.CHORUS_I to 1f,
            MidiParams.CHORUS_II to 0f
        )),
        JunoPreset("Reso Lead", 1, 7, mapOf(
            MidiParams.DCO_RANGE to 2f, // 4'
            MidiParams.DCO_SAW_LEVEL to 1f,
            MidiParams.DCO_SUB_LEVEL to 0.4f,
            MidiParams.VCF_CUTOFF to 0.45f,
            MidiParams.VCF_RESONANCE to 0.75f,
            MidiParams.VCF_ENV_MOD to 0.4f,
            MidiParams.VCF_LFO_MOD to 0.2f,
            MidiParams.LFO_RATE to 0.65f,
            MidiParams.VCA_TYPE to 0f,
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.05f,
            MidiParams.ENV_DECAY to 0.3f,
            MidiParams.ENV_SUSTAIN to 0.75f,
            MidiParams.ENV_RELEASE to 0.3f,
            MidiParams.CHORUS_I to 1f,
            MidiParams.CHORUS_II to 0f
        )),
        JunoPreset("Pizzicato Pad", 1, 8, mapOf(
            MidiParams.DCO_RANGE to 1f,
            MidiParams.DCO_SAW_LEVEL to 0.8f,
            MidiParams.DCO_PULSE_LEVEL to 0.5f,
            MidiParams.DCO_SUB_LEVEL to 0.2f,
            MidiParams.VCF_CUTOFF to 0.5f,
            MidiParams.VCF_RESONANCE to 0.2f,
            MidiParams.VCF_ENV_MOD to 0.5f,
            MidiParams.VCA_TYPE to 0f,
            MidiParams.VCA_DEPTH to 0.85f,
            MidiParams.ENV_ATTACK to 0.01f,
            MidiParams.ENV_DECAY to 0.35f,
            MidiParams.ENV_SUSTAIN to 0.1f,
            MidiParams.ENV_RELEASE to 0.35f,
            MidiParams.CHORUS_I to 0f,
            MidiParams.CHORUS_II to 1f
        ))
    )
}
