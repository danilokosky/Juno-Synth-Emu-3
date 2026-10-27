package com.herajuno.synth.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.herajuno.synth.audio.NativeAudioEngine
import com.herajuno.synth.midi.MidiControllerManager
import com.herajuno.synth.midi.MidiParams

@Composable
fun HeraSynthScreen(midiManager: MidiControllerManager) {
    val connectedDevices by midiManager.connectedDevices.collectAsState()
    val midiActive by midiManager.midiActivity.collectAsState()
    var showMidiDialog by remember { mutableStateOf(false) }
    var midiLearnParam by remember { mutableStateOf<Int?>(null) }

    // Parameter States
    var dcoRange by remember { mutableStateOf(1) } // 8'
    var dcoPwmMod by remember { mutableStateOf(1) } // LFO
    var dcoPitchMod by remember { mutableStateOf(0.0f) }
    var dcoPwmDepth by remember { mutableStateOf(0.0f) }
    var dcoPulseLevel by remember { mutableStateOf(0.0f) }
    var dcoSawLevel by remember { mutableStateOf(1.0f) }
    var dcoSubLevel by remember { mutableStateOf(0.0f) }
    var dcoNoiseLevel by remember { mutableStateOf(0.0f) }

    var hpf by remember { mutableStateOf(0.0f) }

    var vcfCutoff by remember { mutableStateOf(0.65f) }
    var vcfResonance by remember { mutableStateOf(0.0f) }
    var vcfEnvMod by remember { mutableStateOf(0.0f) }
    var vcfLfoMod by remember { mutableStateOf(0.0f) }
    var vcfKeyFollow by remember { mutableStateOf(1.0f) }

    var lfoRate by remember { mutableStateOf(0.6f) }
    var lfoDelay by remember { mutableStateOf(0.0f) }

    var vcaType by remember { mutableStateOf(0) } // ENV
    var vcaDepth by remember { mutableStateOf(0.8f) }

    var envAttack by remember { mutableStateOf(0.35f) }
    var envDecay by remember { mutableStateOf(0.1f) }
    var envSustain by remember { mutableStateOf(1.0f) }
    var envRelease by remember { mutableStateOf(0.45f) }

    var chorusI by remember { mutableStateOf(true) }
    var chorusII by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F1115))
    ) {
        // Top Roland Juno Header Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF16181D))
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "HERA",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = Color.White
                )
                Spacer(modifier = Modifier.width(6.dp))
                Box(
                    modifier = Modifier
                        .background(Color(0xFFDC2626), RoundedCornerShape(3.dp))
                        .padding(horizontal = 4.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "JUNO-60 NATIVE C++",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            // MIDI Status & Learn Button
            Row(verticalAlignment = Alignment.CenterVertically) {
                // MIDI Activity LED
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(if (midiActive) Color(0xFF10B981) else Color(0xFF374151))
                )
                Spacer(modifier = Modifier.width(6.dp))

                Button(
                    onClick = { showMidiDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF272A30)),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    modifier = Modifier.height(28.dp)
                ) {
                    Text(
                        text = if (connectedDevices.isEmpty()) "No MIDI Controller" else "${connectedDevices.size} MIDI Connected",
                        fontSize = 10.sp,
                        color = if (connectedDevices.isEmpty()) Color(0xFF9CA3AF) else Color(0xFF34D399)
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                Button(
                    onClick = {
                        midiLearnParam = if (midiLearnParam == null) MidiParams.VCF_CUTOFF else null
                        midiManager.learningParamId = midiLearnParam
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (midiLearnParam != null) Color(0xFFF59E0B) else Color(0xFF272A30)
                    ),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    modifier = Modifier.height(28.dp)
                ) {
                    Text(
                        text = if (midiLearnParam != null) "LEARNING..." else "MIDI LEARN",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (midiLearnParam != null) Color.Black else Color.White
                    )
                }
            }
        }

        // Synth Controls Panel (Horizontally Scrollable)
        Row(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // LFO Section
            SynthSectionCard(title = "LFO", accentColor = Color(0xFFF59E0B)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    JunoFader(
                        label = "RATE",
                        value = lfoRate,
                        onValueChange = {
                            lfoRate = it
                            NativeAudioEngine.setParameter(MidiParams.LFO_RATE, it)
                        }
                    )
                    JunoFader(
                        label = "DELAY",
                        value = lfoDelay,
                        onValueChange = {
                            lfoDelay = it
                            NativeAudioEngine.setParameter(MidiParams.LFO_DELAY, it)
                        }
                    )
                }
            }

            // DCO Section
            SynthSectionCard(title = "DCO", accentColor = Color(0xFFEF4444)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("RANGE", fontSize = 9.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                        listOf("16'", "8'", "4'").forEachIndexed { idx, label ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(if (dcoRange == idx) Color(0xFFEF4444) else Color(0xFF1F2937))
                                    .clickable {
                                        dcoRange = idx
                                        NativeAudioEngine.setParameter(MidiParams.DCO_RANGE, idx.toFloat())
                                    }
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(label, fontSize = 9.sp, color = Color.White)
                            }
                        }
                    }

                    JunoFader(label = "LFO", value = dcoPitchMod, onValueChange = {
                        dcoPitchMod = it
                        NativeAudioEngine.setParameter(MidiParams.DCO_PITCH_MOD, it)
                    })
                    JunoFader(label = "PWM", value = dcoPwmDepth, onValueChange = {
                        dcoPwmDepth = it
                        NativeAudioEngine.setParameter(MidiParams.DCO_PWM_DEPTH, it)
                    })
                    JunoFader(label = "PULSE", value = dcoPulseLevel, onValueChange = {
                        dcoPulseLevel = it
                        NativeAudioEngine.setParameter(MidiParams.DCO_PULSE_LEVEL, it)
                    })
                    JunoFader(label = "SAW", value = dcoSawLevel, onValueChange = {
                        dcoSawLevel = it
                        NativeAudioEngine.setParameter(MidiParams.DCO_SAW_LEVEL, it)
                    })
                    JunoFader(label = "SUB", value = dcoSubLevel, onValueChange = {
                        dcoSubLevel = it
                        NativeAudioEngine.setParameter(MidiParams.DCO_SUB_LEVEL, it)
                    })
                    JunoFader(label = "NOISE", value = dcoNoiseLevel, onValueChange = {
                        dcoNoiseLevel = it
                        NativeAudioEngine.setParameter(MidiParams.DCO_NOISE_LEVEL, it)
                    })
                }
            }

            // HPF Section
            SynthSectionCard(title = "HPF", accentColor = Color(0xFF06B6D4)) {
                JunoFader(label = "FREQ", value = hpf, onValueChange = {
                    hpf = it
                    NativeAudioEngine.setParameter(MidiParams.HPF, it)
                })
            }

            // VCF Section
            SynthSectionCard(title = "VCF (24dB)", accentColor = Color(0xFF06B6D4)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    JunoFader(label = "FREQ", value = vcfCutoff, onValueChange = {
                        vcfCutoff = it
                        NativeAudioEngine.setParameter(MidiParams.VCF_CUTOFF, it)
                    })
                    JunoFader(label = "RES", value = vcfResonance, onValueChange = {
                        vcfResonance = it
                        NativeAudioEngine.setParameter(MidiParams.VCF_RESONANCE, it)
                    })
                    JunoFader(label = "ENV", value = (vcfEnvMod + 1f) / 2f, onValueChange = {
                        val bipolar = it * 2f - 1f
                        vcfEnvMod = bipolar
                        NativeAudioEngine.setParameter(MidiParams.VCF_ENV_MOD, bipolar)
                    })
                    JunoFader(label = "LFO", value = vcfLfoMod, onValueChange = {
                        vcfLfoMod = it
                        NativeAudioEngine.setParameter(MidiParams.VCF_LFO_MOD, it)
                    })
                    JunoFader(label = "KYBD", value = vcfKeyFollow, onValueChange = {
                        vcfKeyFollow = it
                        NativeAudioEngine.setParameter(MidiParams.VCF_KEY_FOLLOW, it)
                    })
                }
            }

            // VCA Section
            SynthSectionCard(title = "VCA", accentColor = Color(0xFFF59E0B)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("MODE", fontSize = 9.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                        listOf("ENV", "GATE").forEachIndexed { idx, label ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(if (vcaType == idx) Color(0xFFF59E0B) else Color(0xFF1F2937))
                                    .clickable {
                                        vcaType = idx
                                        NativeAudioEngine.setParameter(MidiParams.VCA_TYPE, idx.toFloat())
                                    }
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(label, fontSize = 9.sp, color = Color.White)
                            }
                        }
                    }
                    JunoFader(label = "LEVEL", value = vcaDepth, onValueChange = {
                        vcaDepth = it
                        NativeAudioEngine.setParameter(MidiParams.VCA_DEPTH, it)
                    })
                }
            }

            // ENV Section
            SynthSectionCard(title = "ENV", accentColor = Color(0xFFF59E0B)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    JunoFader(label = "A", value = envAttack, onValueChange = {
                        envAttack = it
                        NativeAudioEngine.setParameter(MidiParams.ENV_ATTACK, it)
                    })
                    JunoFader(label = "D", value = envDecay, onValueChange = {
                        envDecay = it
                        NativeAudioEngine.setParameter(MidiParams.ENV_DECAY, it)
                    })
                    JunoFader(label = "S", value = envSustain, onValueChange = {
                        envSustain = it
                        NativeAudioEngine.setParameter(MidiParams.ENV_SUSTAIN, it)
                    })
                    JunoFader(label = "R", value = envRelease, onValueChange = {
                        envRelease = it
                        NativeAudioEngine.setParameter(MidiParams.ENV_RELEASE, it)
                    })
                }
            }

            // Chorus Section
            SynthSectionCard(title = "CHORUS", accentColor = Color(0xFFE11D48)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ChorusButton(label = "I", active = chorusI) {
                        chorusI = !chorusI
                        NativeAudioEngine.setParameter(MidiParams.CHORUS_I, if (chorusI) 1f else 0f)
                    }
                    ChorusButton(label = "II", active = chorusII) {
                        chorusII = !chorusII
                        NativeAudioEngine.setParameter(MidiParams.CHORUS_II, if (chorusII) 1f else 0f)
                    }
                }
            }
        }

        // Bottom Piano Roll Keyboard
        AndroidPianoKeyboard()
    }

    if (showMidiDialog) {
        AlertDialog(
            onDismissRequest = { showMidiDialog = false },
            title = { Text("MIDI Controller Settings") },
            text = {
                Column {
                    Text("Connected Hardware Controllers:")
                    if (connectedDevices.isEmpty()) {
                        Text("No external USB or Bluetooth MIDI devices detected.", color = Color.Gray)
                    } else {
                        connectedDevices.forEach { dev ->
                            Text("• ${dev.name} (${if (dev.isUsb) "USB" else "Bluetooth"})", color = Color(0xFF10B981))
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("MIDI Mapping (CC -> Param):", fontWeight = FontWeight.Bold)
                    Text("CC 74: Cutoff | CC 71: Resonance\nCC 73: Attack | CC 72: Release\nCC 1: Modulation | CC 7: Volume", fontSize = 11.sp)
                }
            },
            confirmButton = {
                TextButton(onClick = { showMidiDialog = false }) { Text("Close") }
            }
        )
    }
}

@Composable
fun SynthSectionCard(title: String, accentColor: Color, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF17191E)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF2E323B)),
        shape = RoundedCornerShape(4.dp),
        modifier = Modifier.fillMaxHeight()
    ) {
        Column(
            modifier = Modifier.padding(6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(accentColor)
            )
            Text(
                text = title,
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                color = accentColor,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            content()
        }
    }
}

@Composable
fun JunoFader(label: String, value: Float, onValueChange: (Float) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(36.dp)
    ) {
        Text(text = label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFFD1D5DB))
        Spacer(modifier = Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .width(18.dp)
                .height(100.dp)
                .background(Color(0xFF0A0C0E), RoundedCornerShape(3.dp))
                .border(1.dp, Color(0xFF272A30), RoundedCornerShape(3.dp))
                .pointerInput(Unit) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        val delta = -dragAmount.y / 100f
                        val newVal = (value + delta).coerceIn(0f, 1f)
                        onValueChange(newVal)
                    }
                },
            contentAlignment = Alignment.BottomCenter
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(20.dp)
                    .offset(y = (-((value * 80).dp)))
                    .background(
                        Brush.verticalGradient(listOf(Color(0xFFF3F4F6), Color(0xFF9CA3AF))),
                        RoundedCornerShape(2.dp)
                    )
                    .border(1.dp, Color(0xFF4B5563), RoundedCornerShape(2.dp))
            )
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = (value * 10).toInt().toString(),
            fontSize = 9.sp,
            fontFamily = FontFamily.Monospace,
            color = Color(0xFFF59E0B)
        )
    }
}

@Composable
fun ChorusButton(label: String, active: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (active) Color(0xFFBE123C) else Color(0xFF272A30)
        ),
        modifier = Modifier
            .width(44.dp)
            .height(60.dp),
        shape = RoundedCornerShape(4.dp),
        contentPadding = PaddingValues(0.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(if (active) Color(0xFFFACC15) else Color(0xFF1E293B), RoundedCornerShape(1.dp))
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(label, fontWeight = FontWeight.Black, fontSize = 14.sp, color = Color.White)
        }
    }
}

@Composable
fun AndroidPianoKeyboard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(100.dp)
            .background(Color(0xFF08090B))
            .padding(horizontal = 4.dp, vertical = 2.dp)
    ) {
        val whiteKeys = listOf(48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72)
        whiteKeys.forEach { note ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(Color.White, RoundedCornerShape(bottomStart = 3.dp, bottomEnd = 3.dp))
                    .border(1.dp, Color(0xFFD1D5DB))
                    .pointerInput(note) {
                        detectDragGestures(
                            onDragStart = { NativeAudioEngine.noteOn(note, 0.9f) },
                            onDragEnd = { NativeAudioEngine.noteOff(note) },
                            onDragCancel = { NativeAudioEngine.noteOff(note) },
                            onDrag = { _, _ -> }
                        )
                    }
            )
        }
    }
}
