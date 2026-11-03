package com.hera.juno

import android.content.Context
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import kotlin.math.roundToInt

object NativeSynthBridge {
    init {
        try {
            System.loadLibrary("hera_juno")
        } catch (e: UnsatisfiedLinkError) {
            e.printStackTrace()
        }
    }

    external fun initEngine(): Boolean
    external fun stopEngine()
    external fun noteOn(note: Int, velocity: Float)
    external fun noteOff(note: Int)
    external fun allNotesOff()
    external fun setParameter(paramId: Int, value: Float)
    external fun getParameter(paramId: Int): Float
    external fun setPitchBend(bend: Float, modWheel: Float)
    external fun setArpConfig(enabled: Boolean, mode: Int, range: Int, bpm: Float, rateDiv: Int)
    external fun getActiveVoicesCount(): Int
    external fun getWaveformBuffer(outArray: FloatArray)
}

enum class MidiSection(val key: String, val title: String, val subtitle: String) {
    KEYS("keys", "Teclas & Volume Master", "Notas, PitchBend, Master, VCA e Levels DCO"),
    LFO("lfo", "LFO (Vibrato)", "Seção LFO (MIDI Learn / CC)"),
    DCO("dco", "DCO / VCO (Oscilador)", "Seção DCO (MIDI Learn / CC)"),
    HPF("hpf", "HPF (Filtro Passa-Alta)", "Seção HPF (MIDI Learn / CC)"),
    VCF("vcf", "VCF (Filtro Principal)", "Seção VCF (MIDI Learn / CC)"),
    VCA("vca", "VCA (Amplificador)", "Seção VCA (MIDI Learn / CC)"),
    ENV("env", "ENV (Envelope ADSR)", "Seção ENV (MIDI Learn / CC)"),
    CHORUS("chorus", "Chorus BBD", "Seção CHORUS (MIDI Learn / CC)"),
    DELAY("delay", "Echo Delay", "Seção DELAY (MIDI Learn / CC)"),
    REVERB("reverb", "Reverb Global", "Seção REVERB (MIDI Learn / CC)"),
    ARP_PRESETS("arpPresets", "Arpejador & Presets", "Seção ARP/PRG (MIDI Learn / CC)")
}

enum class SynthParam(
    val id: Int,
    val key: String,
    val label: String,
    val section: MidiSection,
    val defaultVal: Float,
    val isSwitch: Boolean = false
) {
    DCORange(0, "DCORange", "RANGE", MidiSection.DCO, 1.0f, true),
    DCOSawLevel(1, "DCOSawLevel", "SAW", MidiSection.DCO, 1.0f),
    DCOPulseLevel(2, "DCOPulseLevel", "PULSE", MidiSection.DCO, 0.0f),
    DCOSubLevel(3, "DCOSubLevel", "SUB", MidiSection.DCO, 0.0f),
    DCONoiseLevel(4, "DCONoiseLevel", "NOISE", MidiSection.DCO, 0.0f),
    DCOPWMDepth(5, "DCOPWMDepth", "PWM", MidiSection.DCO, 0.3f),
    DCOPWMMod(6, "DCOPWMMod", "PWM MOD", MidiSection.DCO, 1.0f, true),
    DCOPitchModDepth(7, "DCOPitchModDepth", "LFO", MidiSection.DCO, 0.0f),
    HPF(8, "HPF", "FREQ", MidiSection.HPF, 0.0f),
    VCFCutoff(9, "VCFCutoff", "FREQ", MidiSection.VCF, 0.7f),
    VCFResonance(10, "VCFResonance", "RES", MidiSection.VCF, 0.0f),
    VCFEnv(11, "VCFEnv", "ENV", MidiSection.VCF, 0.0f),
    VCFLFO(12, "VCFLFO", "LFO", MidiSection.VCF, 0.0f),
    VCFKey(13, "VCFKey", "KYBD", MidiSection.VCF, 1.0f),
    VCFBendDepth(14, "VCFBendDepth", "BEND", MidiSection.VCF, 0.0f),
    VCAType(15, "VCAType", "TYPE", MidiSection.VCA, 0.0f, true),
    VCADepth(16, "VCADepth", "LEVEL", MidiSection.VCA, 0.5f),
    ENVAttack(17, "ENVAttack", "A", MidiSection.ENV, 0.4f),
    ENVDecay(18, "ENVDecay", "D", MidiSection.ENV, 0.0f),
    ENVSustain(19, "ENVSustain", "S", MidiSection.ENV, 1.0f),
    ENVRelease(20, "ENVRelease", "R", MidiSection.ENV, 0.45f),
    LFORate(21, "LFORate", "RATE", MidiSection.LFO, 0.6f),
    LFODelay(22, "LFODelay", "VIB DEL", MidiSection.LFO, 0.0f),
    LFOTrigMode(23, "LFOTrigMode", "LFO TRIG", MidiSection.LFO, 1.0f, true),
    LFOManualTrig(24, "LFOManualTrig", "MAN TRIG", MidiSection.LFO, 0.0f, true),
    ChorusI(25, "ChorusI", "CHORUS I", MidiSection.CHORUS, 1.0f, true),
    ChorusII(26, "ChorusII", "CHORUS II", MidiSection.CHORUS, 0.0f, true),
    DelayEnabled(27, "DelayEnabled", "DELAY ON", MidiSection.DELAY, 0.0f, true),
    DelayTime(28, "DelayTime", "TIME", MidiSection.DELAY, 0.35f),
    DelayFeedback(29, "DelayFeedback", "F-BACK", MidiSection.DELAY, 0.35f),
    DelayMix(30, "DelayMix", "MIX", MidiSection.DELAY, 0.25f),
    ReverbEnabled(31, "ReverbEnabled", "REVERB ON", MidiSection.REVERB, 0.0f, true),
    ReverbType(32, "ReverbType", "MODE", MidiSection.REVERB, 0.0f, true),
    ReverbTime(33, "ReverbTime", "TIME", MidiSection.REVERB, 0.35f),
    ReverbDecay(34, "ReverbDecay", "DECAY", MidiSection.REVERB, 0.55f),
    ReverbMix(35, "ReverbMix", "MIX", MidiSection.REVERB, 0.25f),
    MasterVolume(36, "MasterVolume", "MASTER", MidiSection.KEYS, 0.8f),
    PresetPrev(37, "PresetPrev", "PRG ◀", MidiSection.ARP_PRESETS, 0.0f, true),
    PresetNext(38, "PresetNext", "PRG ▶", MidiSection.ARP_PRESETS, 0.0f, true),
    PresetSelect(39, "PresetSelect", "CUSTOM PRG", MidiSection.ARP_PRESETS, 0.0f, true),
    PitchWheel(40, "PitchWheel", "PITCH", MidiSection.KEYS, 0.0f),
    ModWheel(41, "ModWheel", "MOD", MidiSection.KEYS, 0.0f);

    companion object {
        private val byKey = entries.associateBy { it.key }
        fun fromKey(key: String): SynthParam? = byKey[key]
    }
}

data class HeraPreset(
    val id: Int,
    val name: String,
    val isUserPreset: Boolean = false,
    val values: Map<SynthParam, Float>
)

object PresetRepository {
    private const val PREFS_NAME = "hera_user_presets_prefs"
    private const val KEY_USER_PRESETS_XML = "user_presets_xml_list"

    private fun p(
        id: Int,
        name: String,
        chorusI: Float,
        chorusII: Float,
        noise: Float,
        pwmDepth: Float,
        pwmMod: Float,
        pitchMod: Float,
        pulse: Float,
        range: Float,
        saw: Float,
        sub: Float,
        a: Float,
        d: Float,
        r: Float,
        s: Float,
        hpf: Float,
        lfoDelay: Float,
        lfoRate: Float,
        lfoTrig: Float,
        vcaDepth: Float,
        vcaType: Float,
        vcfBend: Float,
        vcfCutoff: Float,
        vcfEnv: Float,
        vcfKey: Float,
        vcfLfo: Float,
        vcfRes: Float
    ): HeraPreset {
        val normRange = when {
            range <= 0.6f -> 0.0f
            range <= 1.4f -> 1.0f
            else -> 2.0f
        }
        return HeraPreset(
            id = id,
            name = name,
            isUserPreset = false,
            values = mapOf(
                SynthParam.ChorusI to chorusI,
                SynthParam.ChorusII to chorusII,
                SynthParam.DCONoiseLevel to noise,
                SynthParam.DCOPWMDepth to pwmDepth,
                SynthParam.DCOPWMMod to pwmMod,
                SynthParam.DCOPitchModDepth to pitchMod,
                SynthParam.DCOPulseLevel to pulse,
                SynthParam.DCORange to normRange,
                SynthParam.DCOSawLevel to saw,
                SynthParam.DCOSubLevel to sub,
                SynthParam.ENVAttack to a,
                SynthParam.ENVDecay to d,
                SynthParam.ENVRelease to r,
                SynthParam.ENVSustain to s,
                SynthParam.HPF to hpf,
                SynthParam.LFODelay to lfoDelay,
                SynthParam.LFORate to lfoRate,
                SynthParam.LFOTrigMode to lfoTrig,
                SynthParam.VCADepth to vcaDepth,
                SynthParam.VCAType to vcaType,
                SynthParam.VCFBendDepth to vcfBend,
                SynthParam.VCFCutoff to vcfCutoff,
                SynthParam.VCFEnv to vcfEnv.coerceIn(0f, 1f),
                SynthParam.VCFKey to vcfKey,
                SynthParam.VCFLFO to vcfLfo,
                SynthParam.VCFResonance to vcfRes,
                SynthParam.DelayEnabled to 0f,
                SynthParam.DelayTime to 0.35f,
                SynthParam.DelayFeedback to 0.35f,
                SynthParam.DelayMix to 0.25f,
                SynthParam.ReverbEnabled to 0f,
                SynthParam.ReverbType to 0f,
                SynthParam.ReverbTime to 0.35f,
                SynthParam.ReverbDecay to 0.55f,
                SynthParam.ReverbMix to 0.25f
            )
        )
    }

    val FACTORY_PRESETS: List<HeraPreset> = listOf(
        p(0, "Strings 1", 1f, 0f, 0f, 0.3f, 1f, 0f, 0f, 1f, 1f, 0f, 0.4f, 0f, 0.45f, 1f, 0f, 0f, 0.6f, 1f, 0.5f, 0f, 0f, 0.7f, 0f, 1f, 0f, 0f),
        p(1, "Strings 2", 0f, 1f, 0f, 0.6f, 1f, 0f, 1f, 1f, 1f, 0f, 0.4f, 0f, 0.45f, 1f, 0f, 0f, 0.4f, 1f, 0.3f, 0f, 0f, 0.7f, 0f, 1f, 0f, 0f),
        p(2, "Strings 3", 0f, 1f, 0f, 0.7f, 1f, 0f, 1f, 1f, 1f, 1f, 0.3f, 0f, 0.6f, 1f, 0f, 0.8f, 0.3f, 0f, 0.3f, 0f, 0f, 0.5f, 0f, 1f, 0f, 0f),
        p(3, "Organ 1", 1f, 0f, 0f, 0.5f, 0f, 0f, 1f, 1f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, 0.8f, 0.2f, 1f, 0.5f, 1f, 0f, 0.4f, 0.45f, 1f, 0f, 0.6f),
        p(4, "Organ 2", 1f, 0f, 0f, 0.55f, 1f, 0f, 1f, 1f, 0f, 0.8f, 0f, 0.1f, 0.1f, 0f, 0f, 0.4f, 0.5f, 1f, 0.5f, 1f, 0f, 0.35f, 0.4f, 1f, 0f, 0.55f),
        p(5, "Organ 3", 0f, 1f, 0f, 0.55f, 1f, 0f, 1f, 2f, 0f, 0.8f, 0f, 0.1f, 0.1f, 0f, 0f, 0.4f, 0.5f, 1f, 0.5f, 1f, 0f, 0.35f, 0.35f, 1f, 0f, 0.55f),
        p(6, "Brass", 1f, 0f, 0f, 0f, 0f, 0.15f, 0f, 1f, 1f, 0f, 0.25f, 0.4f, 0.2f, 0.6f, 0f, 0.65f, 0.5f, 1f, 0.7f, 0f, 0f, 0f, 0.85f, 0.4f, 0f, 0f),
        p(7, "Phase Brass", 1f, 0f, 0f, 1f, 2f, 0f, 1f, 1f, 1f, 0f, 0.2f, 0.4f, 0.3f, 0.4f, 0f, 0f, 0.6f, 1f, 0.4f, 1f, 0f, 0.3f, 0.55f, 1f, 0f, 0.1f),
        p(8, "Piano 1", 0f, 0f, 0f, 0.6f, 0f, 0.45f, 1f, 1f, 0f, 0f, 0f, 0.8f, 0.3f, 0.15f, 0f, 0.3f, 0.6f, 0f, 0.7f, 0f, 0f, 0.1f, 0.7f, 0.4f, 0f, 0f),
        p(9, "Piano 2", 0f, 0f, 0f, 0.4f, 0f, 0f, 1f, 2f, 0f, 0.45f, 0f, 0.75f, 0.35f, 0f, 0f, 0f, 0.4f, 1f, 0.8f, 0f, 0f, 0.35f, 0.25f, 0.8f, 0.2f, 0f),
        p(10, "Celesta", 0f, 0f, 0f, 0.5f, 2f, 0f, 1f, 1f, 1f, 0f, 0f, 0.65f, 0.55f, 0.2f, 0.35f, 0.6f, 0.35f, 1f, 0.6f, 0f, 0f, 0.35f, 0f, 1f, 0f, 0.8f),
        p(11, "Mellow Piano", 1f, 0f, 0f, 0.5f, 0f, 0f, 1f, 1f, 0f, 0f, 0.1f, 0.75f, 0.85f, 0.2f, 0f, 0f, 0.5f, 0f, 0.7f, 0f, 0f, 0.3f, 0.25f, 0.9f, 0.1f, 0f),
        p(12, "Harpsichord 1", 1f, 0f, 0f, 0.3f, 0f, 0f, 1f, 2f, 0f, 0.7f, 0f, 0.6f, 0.25f, 0.35f, 0.35f, 0.4f, 0.5f, 1f, 0.4f, 0f, 0f, 0.3f, 0.5f, 0.7f, 0f, 0f),
        p(13, "Harpsichord 2", 0f, 1f, 0f, 0.2f, 0f, 0f, 1f, 2f, 0f, 0.85f, 0f, 0.5f, 0.5f, 0.15f, 0.35f, 0.6f, 0.55f, 1f, 0.5f, 0f, 0f, 0.5f, 0.3f, 1f, 0f, 0.25f),
        p(14, "Guitar", 0f, 0f, 0f, 0.6f, 0f, 0f, 1f, 1f, 0f, 0f, 0f, 0.55f, 0.65f, 0.35f, 0.65f, 0.6f, 0.6f, 1f, 0.9f, 0f, 0f, 0.3f, 0.45f, 0.5f, 0.15f, 0f),
        p(15, "Synthesizer Harp", 1f, 0f, 0f, 0f, 0f, 0f, 0f, 1f, 1f, 0f, 0f, 0.55f, 0.5f, 0.3f, 0f, 0.8f, 0.3f, 0f, 0.6f, 0f, 0f, 0.3f, 0.5f, 0.8f, 0f, 0f),
        p(16, "Bass 1", 1f, 0f, 0f, 0.5f, 0f, 0f, 1f, 0f, 1f, 0.3f, 0f, 0.4f, 0.25f, 0.1f, 0f, 0.6f, 0.5f, 1f, 0.5f, 1f, 0f, 0.3f, 0.35f, 0f, 0f, 0.25f),
        p(17, "Bass 2", 1f, 0f, 0f, 0.5f, 0f, 0f, 1f, 0f, 1f, 0f, 0f, 0.3f, 0.25f, 0.35f, 0f, 0.6f, 0.5f, 1f, 0.4f, 1f, 0f, 0.3f, 0.45f, 0.5f, 0f, 0.5f),
        p(18, "Clavichord 1", 1f, 0f, 0f, 0.8f, 0f, 0.4f, 1f, 0f, 0f, 0f, 0f, 0.5f, 0.15f, 0.35f, 0f, 0.25f, 0.6f, 0f, 0.7f, 0f, 0f, 0f, 0.8f, 0.6f, 0f, 0.3f),
        p(19, "Clavichord 2", 0f, 0f, 0f, 0.8f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0.45f, 0.2f, 0.2f, 0.35f, 0f, 0.1f, 1f, 1f, 0f, 0f, 0.55f, 0.2f, 0.7f, 0.25f, 0.7f),
        p(20, "Pizzicato Sound 1", 1f, 0f, 0f, 0.35f, 0f, 0f, 1f, 1f, 0f, 0f, 0f, 0.2f, 0.55f, 0.35f, 0f, 0.6f, 0.5f, 1f, 0.8f, 0f, 0f, 0.45f, 0.3f, 1f, 0.3f, 0.3f),
        p(21, "Pizzicato Sound 2", 0f, 1f, 0f, 0.2f, 0f, 0f, 1f, 2f, 0f, 0.3f, 0f, 0.3f, 0.4f, 0.3f, 0f, 0.6f, 0.5f, 1f, 0.6f, 0f, 0f, 0.5f, 0.3f, 1f, 0f, 0.3f),
        p(22, "Xylophone", 0f, 0f, 0f, 0.5f, 0f, 0f, 0f, 2f, 0f, 1f, 0f, 0.35f, 0.35f, 0f, 0.35f, 0f, 0.5f, 1f, 1f, 0f, 0f, 0.4f, 0.3f, 0.6f, 0f, 0.5f),
        p(23, "Glockenspiel", 0f, 0f, 0f, 0f, 0f, 0f, 1f, 2f, 0f, 0f, 0f, 0.3f, 0.5f, 0.25f, 0.35f, 0f, 0.5f, 1f, 0.9f, 0f, 0f, 0.45f, 0.3f, 0.6f, 0f, 0.5f),
        p(24, "Violine", 0f, 0f, 0f, 0f, 1f, 0.2f, 0f, 1f, 1f, 0f, 0.4f, 0f, 0.4f, 1f, 0.35f, 0.6f, 0.6f, 1f, 0.7f, 0f, 0f, 0.65f, 0f, 1f, 0f, 0f),
        p(25, "Trumpet", 0f, 0f, 0f, 0f, 0f, 0.15f, 0f, 1f, 1f, 0f, 0.25f, 0.4f, 0.2f, 0.6f, 0f, 0.65f, 0.25f, 1f, 0.7f, 0f, 0f, 0f, 0.85f, 0.4f, 0f, 0f),
        p(26, "Horn", 0f, 0f, 0f, 0f, 0f, 0f, 0f, 1f, 1f, 0f, 0.4f, 0.5f, 0.3f, 0.6f, 0f, 0.7f, 0.25f, 1f, 0.7f, 0f, 0f, 0.2f, 0.55f, 0.4f, 0.2f, 0f),
        p(27, "Tuba", 0f, 0f, 0f, 0f, 0f, 0.15f, 0f, 0f, 1f, 0f, 0.3f, 0.4f, 0.3f, 0.4f, 0f, 0.7f, 0.25f, 1f, 1f, 0f, 0f, 0.15f, 0.6f, 0.4f, 0f, 0f),
        p(28, "Flute", 0f, 0f, 0.15f, 0f, 0f, 0f, 0f, 2f, 1f, 0f, 0.2f, 0.6f, 0.25f, 0.5f, 0.35f, 0.5f, 0.55f, 1f, 1f, 0f, 0f, 0.5f, 0f, 0.6f, 0.2f, 0f),
        p(29, "Clarinet", 0f, 0f, 0f, 0f, 0f, 0.15f, 1f, 1f, 0f, 0f, 0.25f, 0.6f, 0.25f, 0.6f, 0.35f, 0.65f, 0.5f, 1f, 0.6f, 0f, 0f, 0.5f, 0.25f, 0.6f, 0f, 0.3f),
        p(30, "Oboe", 0f, 0f, 0f, 0.65f, 0f, 0.15f, 1f, 1f, 0f, 0f, 0.2f, 0.6f, 0.25f, 0.6f, 1f, 0.65f, 0.55f, 1f, 1f, 0f, 0f, 0.45f, 0.25f, 0.5f, 0f, 0.5f),
        p(31, "English Horn", 0f, 0f, 0f, 0.65f, 0f, 0.2f, 1f, 0f, 0f, 0f, 0.2f, 0.6f, 0.25f, 0.6f, 1f, 0.7f, 0.5f, 1f, 1f, 0f, 0f, 0.5f, 0f, 0.5f, 0.15f, 0.7f),
        p(32, "Funny Cat", 0f, 0f, 0f, 0f, 0f, 0.3f, 0f, 1f, 1f, 0f, 0.25f, 0.4f, 0.1f, 1f, 0.35f, 0.2f, 0.6f, 0f, 0.8f, 0f, 0f, 0.15f, 0.5f, 0.5f, 0.2f, 0.75f),
        p(33, "Wah Brass", 0f, 0f, 0f, 0f, 0f, 0.3f, 0f, 1f, 1f, 0f, 0.3f, 0.3f, 0.2f, 0.4f, 0f, 0.2f, 0.6f, 0f, 0.7f, 1f, 0f, 0.3f, 0.45f, 0.6f, 0f, 0.7f),
        p(34, "Phase Combination", 1f, 0f, 0f, 0.8f, 0f, 0f, 1f, 1f, 1f, 0f, 0f, 0.7f, 0.2f, 0.2f, 0f, 0.2f, 0.6f, 0f, 0.3f, 0f, 0f, 0.6f, 0.3f, 0.2f, 0f, 0.2f),
        p(35, "Reed 1", 1f, 0f, 0f, 0f, 0f, 0.4f, 1f, 1f, 0f, 0f, 0f, 0.85f, 0.1f, 0.5f, 0f, 0.2f, 0.6f, 0f, 0.6f, 1f, 0f, 0.1f, 0.7f, 0.5f, 0f, 0.6f),
        p(36, "Popcorn", 0f, 0f, 0f, 0f, 0f, 0f, 0f, 2f, 0f, 1f, 0f, 0.3f, 0f, 0.2f, 0.35f, 0f, 0f, 1f, 0.8f, 0f, 0f, 0.25f, 0.55f, 1f, 0f, 0.2f),
        p(37, "Reed 2", 1f, 0f, 0f, 0f, 0f, 0f, 0f, 2f, 0f, 1f, 0f, 0.55f, 0.6f, 0.3f, 0f, 0.8f, 0.3f, 0f, 0.5f, 0f, 0f, 0.2f, 0.6f, 0.8f, 0f, 0f),
        p(38, "Reed 3", 0f, 0f, 0f, 0.5f, 0f, 0.2f, 0f, 2f, 0f, 1f, 0.25f, 0f, 0.2f, 1f, 0f, 0.2f, 0.6f, 0f, 0.6f, 0f, 0f, 0.3f, 0.3f, 1f, 0f, 0.2f),
        p(39, "PWM Chorus", 0f, 1f, 0f, 0.5f, 1f, 0f, 1f, 1f, 0f, 1f, 0.3f, 0f, 0.4f, 1f, 0f, 0f, 0.3f, 0f, 0.2f, 0f, 0f, 0.8f, 0f, 1f, 0f, 0f),
        p(40, "Synthesizer Organ", 0f, 1f, 0f, 0.65f, 0f, 0f, 1f, 1f, 0f, 0.75f, 0f, 0.2f, 0.25f, 0.5f, 0f, 0.6f, 0.45f, 1f, 0.5f, 1f, 0f, 0.25f, 0.5f, 0.7f, 0.2f, 0f),
        p(41, "Effect Sound 1", 1f, 0f, 0f, 1f, 0f, 0.15f, 1f, 2f, 1f, 0.7f, 0f, 0.5f, 0.55f, 0f, 0f, 0.6f, 0.45f, 1f, 0.7f, 0f, 0f, 0.65f, 0f, 0.7f, 0f, 0f),
        p(42, "Effect Sound 2", 1f, 0f, 0f, 0.3f, 1f, 0f, 0f, 1f, 1f, 0.65f, 0.65f, 0.55f, 0.65f, 0.2f, 0f, 0.9f, 0.55f, 1f, 0.4f, 1f, 0f, 0.65f, 0f, 0.1f, 0f, 0.3f),
        p(43, "Space Harp", 1f, 0f, 0f, 0f, 2f, 0.2f, 0f, 1f, 1f, 0f, 0f, 0.8f, 0.9f, 0.8f, 0f, 0f, 0.55f, 1f, 0.6f, 0f, 0f, 0.65f, 0.55f, 1f, 0f, 0.5f),
        p(44, "Funk", 1f, 0f, 0f, 0.6f, 0f, 0f, 1f, 1f, 1f, 1f, 0.6f, 0.5f, 0f, 0f, 0f, 0.25f, 0.3f, 1f, 0.2f, 1f, 0f, 0.75f, 0f, 0.45f, 0f, 0.6f),
        p(45, "Space Sound 1", 1f, 0f, 0f, 0.45f, 0f, 0.2f, 1f, 1f, 0f, 1f, 0f, 0.8f, 0.3f, 0f, 0f, 0.7f, 0.6f, 1f, 0.3f, 1f, 0f, 0.65f, 0f, 1f, 0f, 0.7f),
        p(46, "Mysterious Invention", 0f, 0f, 0f, 0.8f, 2f, 0.2f, 1f, 1f, 1f, 0f, 0f, 1f, 1f, 0f, 0f, 0.8f, 0.6f, 1f, 0.5f, 0f, 0f, 0.8f, 0f, 0f, 0.25f, 0.7f),
        p(47, "Space Sound 2", 1f, 0f, 0f, 0.6f, 0f, 0f, 1f, 1f, 1f, 0f, 1f, 1f, 1f, 1f, 0f, 0.3f, 0.3f, 1f, 0.2f, 0f, 0f, 0.2f, 0.6f, 1f, 0f, 0.85f),
        p(48, "Percussive Sound 1", 0f, 0f, 1f, 0f, 2f, 0f, 0f, 2f, 0f, 0f, 0f, 0.3f, 0.4f, 0f, 0.35f, 0f, 0f, 1f, 1f, 0f, 0f, 0.4f, 0.15f, 1f, 0f, 1f),
        p(49, "Percussive Sound 2", 0f, 0f, 0f, 0f, 2f, 0f, 0f, 1f, 0f, 0f, 0f, 0.3f, 0.4f, 0f, 0.35f, 0f, 0f, 1f, 1f, 0f, 0f, 0.5f, 0f, 1f, 0f, 1f),
        p(50, "Whistle", 0f, 0f, 0.2f, 0f, 0f, 0f, 0f, 2f, 0f, 0f, 0.3f, 0f, 0.1f, 1f, 0.35f, 0.5f, 0.55f, 1f, 0.8f, 0f, 0f, 0.35f, 0.15f, 1f, 0.2f, 1f),
        p(51, "Effect Sound 3", 0f, 0f, 0f, 0f, 2f, 0f, 0f, 1f, 0f, 0f, 0f, 0.4f, 0.7f, 0.55f, 0.35f, 0.4f, 0.55f, 1f, 1f, 0f, 0f, 0.35f, 0f, 1f, 0.2f, 1f),
        p(52, "UFO", 1f, 0f, 0.2f, 0f, 0f, 0f, 0f, 2f, 0f, 0f, 0f, 0.6f, 0.8f, 1f, 0f, 0f, 0.6f, 1f, 0.4f, 0f, 0f, 0f, 0.7f, 1f, 0.4f, 1f),
        p(53, "Space Sound 3", 1f, 0f, 0.2f, 0f, 0f, 0f, 0f, 2f, 0f, 0f, 0f, 1f, 0.8f, 0f, 0f, 0f, 0.6f, 1f, 0.5f, 0f, 0f, 0.5f, 0f, 1f, 0f, 1f),
        p(54, "Surf", 0f, 0f, 1f, 0f, 2f, 0f, 0f, 1f, 0f, 0f, 0f, 0.4f, 0.8f, 1f, 0f, 0f, 0f, 1f, 0.9f, 0f, 0f, 0.6f, 0f, 1f, 0.6f, 0f),
        p(55, "Synthesizer Drum", 0f, 0f, 0f, 0f, 2f, 0f, 0f, 1f, 0f, 0f, 0f, 0.5f, 0.6f, 0f, 0f, 0f, 0f, 0f, 0.6f, 0f, 0f, 0.2f, 0.4f, 1f, 0f, 1f)
    )

    fun serializePresetToXml(name: String, params: Map<SynthParam, Float>): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        val escapedName = name.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")
        sb.append("<HeraPreset name=\"").append(escapedName).append("\" version=\"1.0\">\n")

        for (param in SynthParam.entries) {
            if (param == SynthParam.MasterVolume || param == SynthParam.LFOManualTrig) continue
            val v = params[param] ?: param.defaultVal
            val formatted = if (param == SynthParam.DCORange) {
                when (v.roundToInt()) {
                    0 -> "0.5"
                    1 -> "1.0"
                    else -> "2.0"
                }
            } else {
                v.toString()
            }
            sb.append("  <Param id=\"").append(param.key).append("\" value=\"").append(formatted).append("\"/>\n")
        }
        sb.append("</HeraPreset>\n")
        return sb.toString()
    }

    fun parsePresetFromXml(xmlContent: String, fallbackId: Int = 100): HeraPreset? {
        return try {
            val parser = Xml.newPullParser()
            parser.setInput(StringReader(xmlContent))
            var presetName = "User Preset"
            val values = mutableMapOf<SynthParam, Float>()
            for (p in SynthParam.entries) {
                values[p] = p.defaultVal
            }

            var eventType = parser.eventType
            while (eventType != XmlPullParser.END_DOCUMENT) {
                if (eventType == XmlPullParser.START_TAG) {
                    when (parser.name) {
                        "HeraPreset", "Preset", "preset", "PROGRAM", "program" -> {
                            val n = parser.getAttributeValue(null, "name")
                            if (!n.isNullOrBlank()) presetName = n
                        }
                        "Param", "param", "PARAM" -> {
                            val idAttr = parser.getAttributeValue(null, "id")
                                ?: parser.getAttributeValue(null, "name")
                            val valAttr = parser.getAttributeValue(null, "value")
                            if (idAttr != null && valAttr != null) {
                                val param = SynthParam.fromKey(idAttr)
                                val num = valAttr.toFloatOrNull()
                                if (param != null && num != null) {
                                    values[param] = if (param == SynthParam.DCORange) {
                                        when {
                                            num <= 0.6f -> 0f
                                            num <= 1.4f -> 1f
                                            else -> 2f
                                        }
                                    } else {
                                        num.coerceIn(0f, 2f)
                                    }
                                }
                            }
                        }
                    }
                }
                eventType = parser.next()
            }
            HeraPreset(id = fallbackId, name = presetName, isUserPreset = true, values = values)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun loadUserPresets(context: Context): List<HeraPreset> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getStringSet(KEY_USER_PRESETS_XML, emptySet()) ?: emptySet()
        return raw.mapIndexedNotNull { idx, xml ->
            parsePresetFromXml(xml, 100 + idx)
        }.sortedBy { it.name }
    }

    fun saveUserPreset(context: Context, preset: HeraPreset): List<HeraPreset> {
        val current = loadUserPresets(context).toMutableList()
        current.removeAll { it.name.equals(preset.name, ignoreCase = true) }
        current.add(preset.copy(isUserPreset = true))
        val xmlSet = current.map { serializePresetToXml(it.name, it.values) }.toSet()
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_USER_PRESETS_XML, xmlSet)
            .apply()
        return loadUserPresets(context)
    }

    fun deleteUserPreset(context: Context, presetName: String): List<HeraPreset> {
        val current = loadUserPresets(context).toMutableList()
        current.removeAll { it.name.equals(presetName, ignoreCase = true) }
        val xmlSet = current.map { serializePresetToXml(it.name, it.values) }.toSet()
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_USER_PRESETS_XML, xmlSet)
            .apply()
        return loadUserPresets(context)
    }
}
