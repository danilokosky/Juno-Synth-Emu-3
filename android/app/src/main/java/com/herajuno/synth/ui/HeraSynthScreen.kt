package com.herajuno.synth.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.herajuno.synth.audio.NativeAudioEngine
import com.herajuno.synth.midi.MidiControllerManager
import com.herajuno.synth.midi.MidiParams
import com.herajuno.synth.presets.JunoPreset
import com.herajuno.synth.presets.JunoPresets
import kotlinx.coroutines.isActive

@Composable
fun HeraSynthScreen(midiManager: MidiControllerManager) {
    val connectedDevices by midiManager.connectedDevices.collectAsState()
    val midiActive by midiManager.midiActivity.collectAsState()
    var showMidiDialog by remember { mutableStateOf(false) }
    var midiLearnParam by remember { mutableStateOf<Int?>(null) }

    // Preset & Bank State
    var currentBank by remember { mutableStateOf(1) }
    var currentPatch by remember { mutableStateOf(1) }
    var currentPresetName by remember { mutableStateOf("Strings 1") }

    // Octave Shift (-2 to +2)
    var octaveShift by remember { mutableStateOf(0) }
    var pitchBenderValue by remember { mutableStateOf(0.0f) }

    // Parameter States
    var dcoRange by remember { mutableStateOf(1) } // 0: 16', 1: 8', 2: 4'
    var dcoPwmMod by remember { mutableStateOf(1) } // 0: Man, 1: LFO, 2: Env
    var dcoPitchMod by remember { mutableStateOf(0.0f) }
    var dcoPwmDepth by remember { mutableStateOf(0.5f) }
    var dcoPulseLevel by remember { mutableStateOf(0.0f) }
    var dcoSawLevel by remember { mutableStateOf(1.0f) }
    var dcoSubLevel by remember { mutableStateOf(0.4f) }
    var dcoNoiseLevel by remember { mutableStateOf(0.0f) }

    var hpf by remember { mutableStateOf(0.1f) }

    var vcfCutoff by remember { mutableStateOf(0.65f) }
    var vcfResonance by remember { mutableStateOf(0.15f) }
    var vcfEnvMod by remember { mutableStateOf(0.2f) }
    var vcfLfoMod by remember { mutableStateOf(0.0f) }
    var vcfKeyFollow by remember { mutableStateOf(0.8f) }

    var lfoRate by remember { mutableStateOf(0.5f) }
    var lfoDelay by remember { mutableStateOf(0.0f) }

    var vcaType by remember { mutableStateOf(0) } // 0: ENV, 1: GATE
    var vcaDepth by remember { mutableStateOf(0.85f) }

    var envAttack by remember { mutableStateOf(0.35f) }
    var envDecay by remember { mutableStateOf(0.2f) }
    var envSustain by remember { mutableStateOf(0.9f) }
    var envRelease by remember { mutableStateOf(0.45f) }

    var chorusI by remember { mutableStateOf(true) }
    var chorusII by remember { mutableStateOf(false) }

    // Load a preset helper
    val loadPreset: (JunoPreset) -> Unit = { preset ->
        currentBank = preset.bank
        currentPatch = preset.patch
        currentPresetName = preset.name

        preset.params[MidiParams.DCO_RANGE]?.let { dcoRange = it.toInt(); NativeAudioEngine.setParameter(MidiParams.DCO_RANGE, it) }
        preset.params[MidiParams.PWM_MOD]?.let { dcoPwmMod = it.toInt(); NativeAudioEngine.setParameter(MidiParams.PWM_MOD, it) }
        preset.params[MidiParams.DCO_PITCH_MOD]?.let { dcoPitchMod = it; NativeAudioEngine.setParameter(MidiParams.DCO_PITCH_MOD, it) }
        preset.params[MidiParams.DCO_PWM_DEPTH]?.let { dcoPwmDepth = it; NativeAudioEngine.setParameter(MidiParams.DCO_PWM_DEPTH, it) }
        preset.params[MidiParams.DCO_PULSE_LEVEL]?.let { dcoPulseLevel = it; NativeAudioEngine.setParameter(MidiParams.DCO_PULSE_LEVEL, it) }
        preset.params[MidiParams.DCO_SAW_LEVEL]?.let { dcoSawLevel = it; NativeAudioEngine.setParameter(MidiParams.DCO_SAW_LEVEL, it) }
        preset.params[MidiParams.DCO_SUB_LEVEL]?.let { dcoSubLevel = it; NativeAudioEngine.setParameter(MidiParams.DCO_SUB_LEVEL, it) }
        preset.params[MidiParams.DCO_NOISE_LEVEL]?.let { dcoNoiseLevel = it; NativeAudioEngine.setParameter(MidiParams.DCO_NOISE_LEVEL, it) }
        preset.params[MidiParams.HPF]?.let { hpf = it; NativeAudioEngine.setParameter(MidiParams.HPF, it) }
        preset.params[MidiParams.VCF_CUTOFF]?.let { vcfCutoff = it; NativeAudioEngine.setParameter(MidiParams.VCF_CUTOFF, it) }
        preset.params[MidiParams.VCF_RESONANCE]?.let { vcfResonance = it; NativeAudioEngine.setParameter(MidiParams.VCF_RESONANCE, it) }
        preset.params[MidiParams.VCF_ENV_MOD]?.let { vcfEnvMod = it; NativeAudioEngine.setParameter(MidiParams.VCF_ENV_MOD, it) }
        preset.params[MidiParams.VCF_LFO_MOD]?.let { vcfLfoMod = it; NativeAudioEngine.setParameter(MidiParams.VCF_LFO_MOD, it) }
        preset.params[MidiParams.VCF_KEY_FOLLOW]?.let { vcfKeyFollow = it; NativeAudioEngine.setParameter(MidiParams.VCF_KEY_FOLLOW, it) }
        preset.params[MidiParams.VCA_TYPE]?.let { vcaType = it.toInt(); NativeAudioEngine.setParameter(MidiParams.VCA_TYPE, it) }
        preset.params[MidiParams.VCA_DEPTH]?.let { vcaDepth = it; NativeAudioEngine.setParameter(MidiParams.VCA_DEPTH, it) }
        preset.params[MidiParams.ENV_ATTACK]?.let { envAttack = it; NativeAudioEngine.setParameter(MidiParams.ENV_ATTACK, it) }
        preset.params[MidiParams.ENV_DECAY]?.let { envDecay = it; NativeAudioEngine.setParameter(MidiParams.ENV_DECAY, it) }
        preset.params[MidiParams.ENV_SUSTAIN]?.let { envSustain = it; NativeAudioEngine.setParameter(MidiParams.ENV_SUSTAIN, it) }
        preset.params[MidiParams.ENV_RELEASE]?.let { envRelease = it; NativeAudioEngine.setParameter(MidiParams.ENV_RELEASE, it) }
        preset.params[MidiParams.CHORUS_I]?.let { chorusI = (it > 0.5f); NativeAudioEngine.setParameter(MidiParams.CHORUS_I, it) }
        preset.params[MidiParams.CHORUS_II]?.let { chorusII = (it > 0.5f); NativeAudioEngine.setParameter(MidiParams.CHORUS_II, it) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0D0E12))
    ) {
        // Walnut Wood End-Cheeks (Left & Right)
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(10.dp)
                .align(Alignment.CenterStart)
                .background(Brush.horizontalGradient(listOf(Color(0xFF3E1D0E), Color(0xFF5B2912), Color(0xFF2B1207))))
        )
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(10.dp)
                .align(Alignment.CenterEnd)
                .background(Brush.horizontalGradient(listOf(Color(0xFF2B1207), Color(0xFF5B2912), Color(0xFF3E1D0E))))
        )

        // Main Synth Body
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 10.dp)
        ) {
            // Roland Header Strip with Rainbow Accent Line
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF131418))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Logo & Badge
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "HERA",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black,
                            fontFamily = FontFamily.Monospace,
                            letterSpacing = 2.sp,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .background(Color(0xFFDC2626), RoundedCornerShape(2.dp))
                                .padding(horizontal = 4.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "JUNO-60",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.sp,
                                color = Color.White
                            )
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "6-VOICE POLYPHONIC SYNTHESIZER",
                            fontSize = 8.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFF9CA3AF)
                        )
                    }

                    // 7-Segment LED Bank/Patch Display & Preset Name
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Digital 7-Segment LED Box
                        Box(
                            modifier = Modifier
                                .background(Color(0xFF180303), RoundedCornerShape(3.dp))
                                .border(1.dp, Color(0xFF450A0A), RoundedCornerShape(3.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "$currentBank - $currentPatch",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black,
                                fontFamily = FontFamily.Monospace,
                                color = Color(0xFFEF4444)
                            )
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = currentPresetName,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = Color(0xFFF3F4F6)
                        )
                    }

                    // MIDI Status & Learn Button
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // MIDI LED
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (midiActive) Color(0xFF10B981) else Color(0xFF374151))
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Button(
                            onClick = { showMidiDialog = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E2127)),
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                            modifier = Modifier.height(24.dp)
                        ) {
                            Text(
                                text = if (connectedDevices.isEmpty()) "MIDI USB" else "MIDI (${connectedDevices.size})",
                                fontSize = 9.sp,
                                color = if (connectedDevices.isEmpty()) Color(0xFF9CA3AF) else Color(0xFF34D399)
                            )
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        Button(
                            onClick = {
                                midiLearnParam = if (midiLearnParam == null) MidiParams.VCF_CUTOFF else null
                                midiManager.learningParamId = midiLearnParam
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (midiLearnParam != null) Color(0xFFF59E0B) else Color(0xFF1E2127)
                            ),
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                            modifier = Modifier.height(24.dp)
                        ) {
                            Text(
                                text = if (midiLearnParam != null) "LEARNING" else "LEARN",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (midiLearnParam != null) Color.Black else Color.White
                            )
                        }
                    }
                }

                // Authentic Roland Rainbow Accent Line
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                ) {
                    Box(modifier = Modifier.weight(1f).fillMaxHeight().background(Color(0xFFDC2626)))
                    Box(modifier = Modifier.weight(1f).fillMaxHeight().background(Color(0xFFEA580C)))
                    Box(modifier = Modifier.weight(1f).fillMaxHeight().background(Color(0xFFEAB308)))
                    Box(modifier = Modifier.weight(1f).fillMaxHeight().background(Color(0xFF06B6D4)))
                    Box(modifier = Modifier.weight(1f).fillMaxHeight().background(Color(0xFF2563EB)))
                }
            }

            // Synth Control Faders & Panels (Horizontally Scrollable)
            Row(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Preset Bank Selector Section
                JunoSectionBox(title = "PRESETS", headerColor = Color(0xFF64748B)) {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            (1..4).forEach { b ->
                                JunoMiniButton(text = "B$b", active = currentBank == b) {
                                    currentBank = b
                                    JunoPresets.factoryPresets.find { it.bank == currentBank && it.patch == currentPatch }?.let(loadPreset)
                                }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            (1..4).forEach { p ->
                                JunoMiniButton(text = "P$p", active = currentPatch == p) {
                                    currentPatch = p
                                    JunoPresets.factoryPresets.find { it.bank == currentBank && it.patch == currentPatch }?.let(loadPreset)
                                }
                            }
                        }
                    }
                }

                // LFO Section
                JunoSectionBox(title = "LFO", headerColor = Color(0xFFEAB308)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        JunoVerticalFader("RATE", lfoRate) {
                            lfoRate = it
                            NativeAudioEngine.setParameter(MidiParams.LFO_RATE, it)
                        }
                        JunoVerticalFader("DELAY", lfoDelay) {
                            lfoDelay = it
                            NativeAudioEngine.setParameter(MidiParams.LFO_DELAY, it)
                        }
                    }
                }

                // DCO Section
                JunoSectionBox(title = "DCO", headerColor = Color(0xFFDC2626)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("RANGE", fontSize = 8.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                            listOf("16'", "8'", "4'").forEachIndexed { idx, label ->
                                JunoMiniButton(text = label, active = dcoRange == idx) {
                                    dcoRange = idx
                                    NativeAudioEngine.setParameter(MidiParams.DCO_RANGE, idx.toFloat())
                                }
                            }
                        }
                        JunoVerticalFader("LFO", dcoPitchMod) {
                            dcoPitchMod = it
                            NativeAudioEngine.setParameter(MidiParams.DCO_PITCH_MOD, it)
                        }
                        JunoVerticalFader("PWM", dcoPwmDepth) {
                            dcoPwmDepth = it
                            NativeAudioEngine.setParameter(MidiParams.DCO_PWM_DEPTH, it)
                        }
                        JunoVerticalFader("PULSE", dcoPulseLevel) {
                            dcoPulseLevel = it
                            NativeAudioEngine.setParameter(MidiParams.DCO_PULSE_LEVEL, it)
                        }
                        JunoVerticalFader("SAW", dcoSawLevel) {
                            dcoSawLevel = it
                            NativeAudioEngine.setParameter(MidiParams.DCO_SAW_LEVEL, it)
                        }
                        JunoVerticalFader("SUB", dcoSubLevel) {
                            dcoSubLevel = it
                            NativeAudioEngine.setParameter(MidiParams.DCO_SUB_LEVEL, it)
                        }
                        JunoVerticalFader("NOISE", dcoNoiseLevel) {
                            dcoNoiseLevel = it
                            NativeAudioEngine.setParameter(MidiParams.DCO_NOISE_LEVEL, it)
                        }
                    }
                }

                // HPF Section
                JunoSectionBox(title = "HPF", headerColor = Color(0xFF06B6D4)) {
                    JunoVerticalFader("FREQ", hpf) {
                        hpf = it
                        NativeAudioEngine.setParameter(MidiParams.HPF, it)
                    }
                }

                // VCF Section (24dB/oct resonant filter)
                JunoSectionBox(title = "VCF (24dB)", headerColor = Color(0xFF06B6D4)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        JunoVerticalFader("FREQ", vcfCutoff) {
                            vcfCutoff = it
                            NativeAudioEngine.setParameter(MidiParams.VCF_CUTOFF, it)
                        }
                        JunoVerticalFader("RES", vcfResonance) {
                            vcfResonance = it
                            NativeAudioEngine.setParameter(MidiParams.VCF_RESONANCE, it)
                        }
                        JunoVerticalFader("ENV", (vcfEnvMod + 1.0f) / 2.0f) {
                            val bip = it * 2.0f - 1.0f
                            vcfEnvMod = bip
                            NativeAudioEngine.setParameter(MidiParams.VCF_ENV_MOD, bip)
                        }
                        JunoVerticalFader("LFO", vcfLfoMod) {
                            vcfLfoMod = it
                            NativeAudioEngine.setParameter(MidiParams.VCF_LFO_MOD, it)
                        }
                        JunoVerticalFader("KYBD", vcfKeyFollow) {
                            vcfKeyFollow = it
                            NativeAudioEngine.setParameter(MidiParams.VCF_KEY_FOLLOW, it)
                        }
                    }
                }

                // VCA Section
                JunoSectionBox(title = "VCA", headerColor = Color(0xFFEA580C)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("MODE", fontSize = 8.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                            listOf("ENV", "GATE").forEachIndexed { idx, label ->
                                JunoMiniButton(text = label, active = vcaType == idx) {
                                    vcaType = idx
                                    NativeAudioEngine.setParameter(MidiParams.VCA_TYPE, idx.toFloat())
                                }
                            }
                        }
                        JunoVerticalFader("LEVEL", vcaDepth) {
                            vcaDepth = it
                            NativeAudioEngine.setParameter(MidiParams.VCA_DEPTH, it)
                        }
                    }
                }

                // ENV Section
                JunoSectionBox(title = "ENV", headerColor = Color(0xFFEA580C)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        JunoVerticalFader("A", envAttack) {
                            envAttack = it
                            NativeAudioEngine.setParameter(MidiParams.ENV_ATTACK, it)
                        }
                        JunoVerticalFader("D", envDecay) {
                            envDecay = it
                            NativeAudioEngine.setParameter(MidiParams.ENV_DECAY, it)
                        }
                        JunoVerticalFader("S", envSustain) {
                            envSustain = it
                            NativeAudioEngine.setParameter(MidiParams.ENV_SUSTAIN, it)
                        }
                        JunoVerticalFader("R", envRelease) {
                            envRelease = it
                            NativeAudioEngine.setParameter(MidiParams.ENV_RELEASE, it)
                        }
                    }
                }

                // Chorus Section (Roland Stereo BBD)
                JunoSectionBox(title = "CHORUS", headerColor = Color(0xFFE11D48)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        JunoChorusButton(label = "I", active = chorusI) {
                            chorusI = !chorusI
                            NativeAudioEngine.setParameter(MidiParams.CHORUS_I, if (chorusI) 1.0f else 0.0f)
                        }
                        JunoChorusButton(label = "II", active = chorusII) {
                            chorusII = !chorusII
                            NativeAudioEngine.setParameter(MidiParams.CHORUS_II, if (chorusII) 1.0f else 0.0f)
                        }
                    }
                }
            }

            // Bottom Section: Pitch Bender Lever & Multi-Touch Polyphonic Keyboard
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(115.dp)
                    .background(Color(0xFF090A0D))
                    .padding(vertical = 2.dp)
            ) {
                // Pitch Bender Lever & Octave Transpose Bar
                Column(
                    modifier = Modifier
                        .width(60.dp)
                        .fillMaxHeight()
                        .background(Color(0xFF14161C), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF272A30), RoundedCornerShape(4.dp))
                        .padding(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    // Octave Shift Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Text(
                            text = "OCT",
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.Gray
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(0xFF232730))
                                .clickable {
                                    octaveShift = (octaveShift - 1).coerceAtLeast(-2)
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("-", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(0xFF232730))
                                .clickable {
                                    octaveShift = (octaveShift + 1).coerceAtMost(2)
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("+", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }

                    // Pitch Bend Spring Lever
                    Box(
                        modifier = Modifier
                            .width(28.dp)
                            .height(55.dp)
                            .background(Color(0xFF0B0D11), RoundedCornerShape(4.dp))
                            .border(1.dp, Color(0xFF374151), RoundedCornerShape(4.dp))
                            .pointerInput(Unit) {
                                detectDragGestures(
                                    onDrag = { change, dragAmount ->
                                        change.consume()
                                        val delta = -dragAmount.y / 25.0f
                                        pitchBenderValue = (pitchBenderValue + delta).coerceIn(-1.0f, 1.0f)
                                        NativeAudioEngine.setPitchBend(pitchBenderValue)
                                    },
                                    onDragEnd = {
                                        pitchBenderValue = 0.0f
                                        NativeAudioEngine.setPitchBend(0.0f)
                                    },
                                    onDragCancel = {
                                        pitchBenderValue = 0.0f
                                        NativeAudioEngine.setPitchBend(0.0f)
                                    }
                                )
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(16.dp)
                                .offset(y = (-pitchBenderValue * 18.0f).dp)
                                .background(Color(0xFFEF4444), RoundedCornerShape(2.dp))
                        )
                    }
                }

                Spacer(modifier = Modifier.width(4.dp))

                // Multi-Touch Polyphonic Piano Keyboard
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                ) {
                    JunoMultiTouchKeyboard(octaveShift = octaveShift)
                }
            }
        }
    }

    if (showMidiDialog) {
        AlertDialog(
            onDismissRequest = { showMidiDialog = false },
            title = { Text("MIDI Controller Settings") },
            text = {
                Column {
                    Text("Detected Hardware Controllers:")
                    if (connectedDevices.isEmpty()) {
                        Text("No external USB/Bluetooth MIDI keyboard detected.", color = Color.Gray)
                    } else {
                        connectedDevices.forEach { dev ->
                            Text("• ${dev.name} (${if (dev.isUsb) "USB" else "Bluetooth"})", color = Color(0xFF10B981))
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("MIDI Hardware CC Mapping:", fontWeight = FontWeight.Bold)
                    Text("CC 74: Cutoff | CC 71: Resonance\nCC 73: Attack | CC 72: Release\nCC 1: Modulation | CC 7: Volume", fontSize = 10.sp)
                }
            },
            confirmButton = {
                TextButton(onClick = { showMidiDialog = false }) { Text("Close") }
            }
        )
    }
}

@Composable
fun JunoSectionBox(title: String, headerColor: Color, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF15171C)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF282C36)),
        shape = RoundedCornerShape(3.dp),
        modifier = Modifier.fillMaxHeight()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(headerColor)
            )
            Text(
                text = title,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                color = headerColor,
                modifier = Modifier.padding(vertical = 2.dp)
            )
            content()
        }
    }
}

@Composable
fun JunoVerticalFader(label: String, value: Float, onValueChange: (Float) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(30.dp)
    ) {
        Text(text = label, fontSize = 7.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFD1D5DB))
        Spacer(modifier = Modifier.height(2.dp))
        Box(
            modifier = Modifier
                .width(16.dp)
                .height(80.dp)
                .background(Color(0xFF0B0D10), RoundedCornerShape(2.dp))
                .border(1.dp, Color(0xFF2A2E38), RoundedCornerShape(2.dp))
                .pointerInput(Unit) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        val delta = -dragAmount.y / 80.0f
                        val newVal = (value + delta).coerceIn(0.0f, 1.0f)
                        onValueChange(newVal)
                    }
                },
            contentAlignment = Alignment.BottomCenter
        ) {
            // Track Groove Line
            Box(
                modifier = Modifier
                    .width(2.dp)
                    .fillMaxHeight()
                    .background(Color(0xFF1E222A))
            )
            // Silver Cap Handle with White Line
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(18.dp)
                    .offset(y = (-((value * 62).dp)))
                    .background(
                        Brush.verticalGradient(listOf(Color(0xFFE5E7EB), Color(0xFF9CA3AF), Color(0xFF4B5563))),
                        RoundedCornerShape(2.dp)
                    )
                    .border(0.5.dp, Color(0xFF374151), RoundedCornerShape(2.dp)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.8f)
                        .height(1.5.dp)
                        .background(Color.White)
                )
            }
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = (value * 10).toInt().toString(),
            fontSize = 7.5.sp,
            fontFamily = FontFamily.Monospace,
            color = Color(0xFFF59E0B)
        )
    }
}

@Composable
fun JunoMiniButton(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(2.dp))
            .background(if (active) Color(0xFFEF4444) else Color(0xFF22262E))
            .border(0.5.dp, if (active) Color(0xFFFCA5A5) else Color(0xFF374151), RoundedCornerShape(2.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 2.dp)
    ) {
        Text(text, fontSize = 8.sp, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

@Composable
fun JunoChorusButton(label: String, active: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (active) Color(0xFF9F1239) else Color(0xFF20242C)
        ),
        modifier = Modifier
            .width(36.dp)
            .height(55.dp),
        shape = RoundedCornerShape(3.dp),
        contentPadding = PaddingValues(0.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            // Yellow Glowing LED Indicator
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .background(if (active) Color(0xFFFACC15) else Color(0xFF1E293B), RoundedCornerShape(1.dp))
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(label, fontWeight = FontWeight.Black, fontSize = 13.sp, color = Color.White)
        }
    }
}

/**
 * True Multi-Touch Polyphonic Piano Keyboard
 * Tracks multiple fingers simultaneously with individual NoteOn and NoteOff events.
 */
@Composable
fun JunoMultiTouchKeyboard(octaveShift: Int) {
    val baseNote = 48 + (octaveShift * 12) // Default C3 (MIDI 48)

    // White keys in 2 octaves (15 keys: C3 to C5)
    val whiteNotes = remember(baseNote) {
        listOf(
            baseNote,      // C
            baseNote + 2,  // D
            baseNote + 4,  // E
            baseNote + 5,  // F
            baseNote + 7,  // G
            baseNote + 9,  // A
            baseNote + 11, // B
            baseNote + 12, // C
            baseNote + 14, // D
            baseNote + 16, // E
            baseNote + 17, // F
            baseNote + 19, // G
            baseNote + 21, // A
            baseNote + 23, // B
            baseNote + 24  // C
        )
    }

    // Black keys with their fractional horizontal center positions (relative to white key index)
    val blackKeyDefs = remember(baseNote) {
        listOf(
            Pair(baseNote + 1, 0.65f),  // C#
            Pair(baseNote + 3, 1.75f),  // D#
            Pair(baseNote + 6, 3.65f),  // F#
            Pair(baseNote + 8, 4.7f),   // G#
            Pair(baseNote + 10, 5.75f), // A#
            Pair(baseNote + 13, 7.65f), // C#
            Pair(baseNote + 15, 8.75f), // D#
            Pair(baseNote + 18, 10.65f),// F#
            Pair(baseNote + 20, 11.7f), // G#
            Pair(baseNote + 22, 12.75f) // A#
        )
    }

    // Set of currently pressed notes for visual feedback
    val activeNotes = remember { mutableStateMapOf<Int, Boolean>() }
    // Map of pointerId to current note
    val pointerNotes = remember { mutableStateMapOf<Long, Int>() }

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(baseNote) {
                awaitPointerEventScope {
                    while (isActive) {
                        val event = awaitPointerEvent()
                        val numWhite = whiteNotes.size
                        val whiteKeyWidth = size.width / numWhite
                        val blackKeyWidth = whiteKeyWidth * 0.62f
                        val blackKeyHeight = size.height * 0.62f

                        val currentDownPointerIds = mutableSetOf<Long>()

                        for (change in event.changes) {
                            val pId = change.id.value
                            if (change.pressed) {
                                currentDownPointerIds.add(pId)
                                val pos = change.position
                                var hitNote: Int? = null

                                // 1. Test black keys first (they sit on top)
                                if (pos.y <= blackKeyHeight) {
                                    for ((note, centerFrac) in blackKeyDefs) {
                                        val centerX = centerFrac * whiteKeyWidth
                                        val left = centerX - blackKeyWidth / 2f
                                        val right = centerX + blackKeyWidth / 2f
                                        if (pos.x in left..right) {
                                            hitNote = note
                                            break
                                        }
                                    }
                                }

                                // 2. Test white keys
                                if (hitNote == null && pos.x >= 0 && pos.x <= size.width) {
                                    val whiteIndex = (pos.x / whiteKeyWidth).toInt().coerceIn(0, numWhite - 1)
                                    hitNote = whiteNotes[whiteIndex]
                                }

                                if (hitNote != null) {
                                    val previousNote = pointerNotes[pId]
                                    if (previousNote != hitNote) {
                                        if (previousNote != null) {
                                            NativeAudioEngine.noteOff(previousNote)
                                            activeNotes.remove(previousNote)
                                        }
                                        pointerNotes[pId] = hitNote
                                        activeNotes[hitNote] = true
                                        NativeAudioEngine.noteOn(hitNote, 0.9f)
                                    }
                                }
                            } else {
                                // Pointer lifted
                                val oldNote = pointerNotes.remove(pId)
                                if (oldNote != null) {
                                    activeNotes.remove(oldNote)
                                    NativeAudioEngine.noteOff(oldNote)
                                }
                            }
                        }

                        // Clean up any pointers no longer in event
                        val removed = pointerNotes.keys.filter { !currentDownPointerIds.contains(it) }
                        for (r in removed) {
                            val oldNote = pointerNotes.remove(r)
                            if (oldNote != null) {
                                activeNotes.remove(oldNote)
                                NativeAudioEngine.noteOff(oldNote)
                            }
                        }
                    }
                }
            }
    ) {
        val numWhite = whiteNotes.size
        val whiteKeyWidth = size.width / numWhite
        val blackKeyWidth = whiteKeyWidth * 0.62f
        val blackKeyHeight = size.height * 0.62f

        // Draw White Keys
        for (i in 0 until numWhite) {
            val note = whiteNotes[i]
            val isPressed = activeNotes[note] == true
            val x = i * whiteKeyWidth

            // White key background
            val brush = if (isPressed) {
                Brush.verticalGradient(
                    listOf(Color(0xFFFEF3C7), Color(0xFFFDE68A), Color(0xFFF59E0B)),
                    startY = 0f,
                    endY = size.height
                )
            } else {
                Brush.verticalGradient(
                    listOf(Color(0xFFFFFFFF), Color(0xFFF3F4F6), Color(0xFFE5E7EB)),
                    startY = 0f,
                    endY = size.height
                )
            }

            drawRoundRect(
                brush = brush,
                topLeft = Offset(x, 0f),
                size = Size(whiteKeyWidth - 1f, size.height),
                cornerRadius = CornerRadius(3f, 3f)
            )

            // Divider border
            drawLine(
                color = Color(0xFF9CA3AF),
                start = Offset(x + whiteKeyWidth - 1f, 0f),
                end = Offset(x + whiteKeyWidth - 1f, size.height),
                strokeWidth = 1f
            )
        }

        // Draw Black Keys
        for ((note, centerFrac) in blackKeyDefs) {
            val isPressed = activeNotes[note] == true
            val centerX = centerFrac * whiteKeyWidth
            val left = centerX - blackKeyWidth / 2f

            val brush = if (isPressed) {
                Brush.verticalGradient(
                    listOf(Color(0xFFB45309), Color(0xFFD97706), Color(0xFF92400E)),
                    startY = 0f,
                    endY = blackKeyHeight
                )
            } else {
                Brush.verticalGradient(
                    listOf(Color(0xFF262626), Color(0xFF171717), Color(0xFF0A0A0A)),
                    startY = 0f,
                    endY = blackKeyHeight
                )
            }

            drawRoundRect(
                brush = brush,
                topLeft = Offset(left, 0f),
                size = Size(blackKeyWidth, blackKeyHeight),
                cornerRadius = CornerRadius(2f, 2f)
            )

            // 3D edge highlight
            drawLine(
                color = if (isPressed) Color(0xFFFCD34D) else Color(0xFF404040),
                start = Offset(left + 1f, 0f),
                end = Offset(left + 1f, blackKeyHeight),
                strokeWidth = 1f
            )
        }
    }
}
