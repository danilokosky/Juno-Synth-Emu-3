package com.hera.juno

import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

// Authentic Roland Juno-60 Color Palette
private val JunoBgDark = Color(0xFF0E1015)
private val JunoPanelBg = Color(0xFF151820)
private val JunoSectionBorder = Color(0xFF282E3D)
private val JunoRed = Color(0xFFE03C31)
private val JunoOrange = Color(0xFFE87722)
private val JunoBlue = Color(0xFF009CDE)
private val JunoPurple = Color(0xFF7C3AED)
private val JunoAmberLed = Color(0xFFFFB000)
private val JunoCyanLearn = Color(0xFF0EA5E9)
private val JunoGreenReady = Color(0xFF10B981)
private val JunoWoodLight = Color(0xFF6B321C)
private val JunoWoodDark = Color(0xFF3A180B)

class MainActivity : ComponentActivity() {

    private var midiControllerManager: MidiControllerManager? = null
    private val paramStateMap = mutableStateMapOf<SynthParam, Float>()
    private val activeNotesState = mutableStateListOf<Int>()
    private var uiRevision by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableImmersiveFullscreen()

        // Initialize default parameters
        val initialPreset = PresetRepository.FACTORY_PRESETS.first()
        for (p in SynthParam.entries) {
            val v = initialPreset.values[p] ?: p.defaultVal
            paramStateMap[p] = v
        }

        // Start Native C++ AAudio Engine
        NativeSynthBridge.initEngine()
        for ((p, v) in paramStateMap) {
            NativeSynthBridge.setParameter(p.id, v)
        }

        // Start Native Android Hardware MIDI Manager
        midiControllerManager = MidiControllerManager(
            context = this,
            onNoteOn = { note, vel ->
                if (!activeNotesState.contains(note)) activeNotesState.add(note)
                NativeSynthBridge.noteOn(note, vel)
            },
            onNoteOff = { note ->
                activeNotesState.remove(note)
                NativeSynthBridge.noteOff(note)
            },
            onPitchBend = { bend, mod ->
                NativeSynthBridge.setPitchBend(bend, mod)
            },
            onParamChanged = { param, value ->
                paramStateMap[param] = value
                NativeSynthBridge.setParameter(param.id, value)
            },
            onProfileUpdated = {
                uiRevision++
            }
        )

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                val mgr = midiControllerManager
                if (mgr != null) {
                    HeraJunoNativeScreen(
                        paramState = paramStateMap,
                        activeNotes = activeNotesState,
                        midiManager = mgr,
                        uiRevision = uiRevision,
                        onNotifyUiChanged = { uiRevision++ },
                        onUpdateParam = { param, value ->
                            paramStateMap[param] = value
                            NativeSynthBridge.setParameter(param.id, value)
                        },
                        onTriggerNoteOn = { note, vel ->
                            if (!activeNotesState.contains(note)) activeNotesState.add(note)
                            NativeSynthBridge.noteOn(note, vel)
                        },
                        onTriggerNoteOff = { note ->
                            activeNotesState.remove(note)
                            NativeSynthBridge.noteOff(note)
                        },
                        onPanicAllNotesOff = {
                            activeNotesState.clear()
                            NativeSynthBridge.allNotesOff()
                        }
                    )
                }
            }
        }
    }

    private fun enableImmersiveFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enableImmersiveFullscreen()
    }

    override fun onDestroy() {
        super.onDestroy()
        midiControllerManager?.release()
        NativeSynthBridge.stopEngine()
    }
}

@Composable
fun HeraJunoNativeScreen(
    paramState: Map<SynthParam, Float>,
    activeNotes: List<Int>,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onNotifyUiChanged: () -> Unit,
    onUpdateParam: (SynthParam, Float) -> Unit,
    onTriggerNoteOn: (Int, Float) -> Unit,
    onTriggerNoteOff: (Int) -> Unit,
    onPanicAllNotesOff: () -> Unit
) {
    val context = LocalContext.current
    var userPresets by remember { mutableStateOf(PresetRepository.loadUserPresets(context)) }
    val allPresets = remember(userPresets) { PresetRepository.FACTORY_PRESETS + userPresets }
    var currentPresetIndex by remember { mutableIntStateOf(0) }
    val currentPreset = allPresets.getOrElse(currentPresetIndex) { PresetRepository.FACTORY_PRESETS.first() }

    // Arpeggiator State
    var arpEnabled by remember { mutableStateOf(false) }
    var arpMode by remember { mutableIntStateOf(0) } // 0=UP, 1=UP/DN, 2=DOWN
    var arpRange by remember { mutableIntStateOf(1) } // 1..3
    var arpRateDiv by remember { mutableIntStateOf(8) } // 4, 8, 16
    var arpBpm by remember { mutableFloatStateOf(120f) }
    var arpExpanded by remember { mutableStateOf(true) }

    // Keyboard & Modals State
    var showKeyboard by remember { mutableStateOf(true) }
    var holdSustain by remember { mutableStateOf(false) }
    var baseOctave by remember { mutableIntStateOf(3) } // C3..C5
    var pitchBendUi by remember { mutableFloatStateOf(0f) }
    var modWheelUi by remember { mutableFloatStateOf(0f) }
    var isMasterMuted by remember { mutableStateOf(false) }
    var preMuteMasterVolume by remember { mutableFloatStateOf(0.8f) }

    var showChannelsDialog by remember { mutableStateOf(false) }
    var showPresetsDialog by remember { mutableStateOf(false) }
    var showSavePresetDialog by remember { mutableStateOf(false) }
    var showProfileDialog by remember { mutableStateOf(false) }

    // Sync Arpeggiator config with C++ engine
    LaunchedEffect(arpEnabled, arpMode, arpRange, arpBpm, arpRateDiv) {
        NativeSynthBridge.setArpConfig(arpEnabled, arpMode, arpRange, arpBpm, arpRateDiv)
    }

    // Real-time 60fps Oscilloscope & Voice Count polling from C++ engine
    val waveformSamples = remember { FloatArray(256) }
    var waveformTick by remember { mutableIntStateOf(0) }
    var activeVoiceCount by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            NativeSynthBridge.getWaveformBuffer(waveformSamples)
            activeVoiceCount = NativeSynthBridge.getActiveVoicesCount()
            waveformTick++
            delay(16L)
        }
    }

    // SAF Preset Export Launcher (.xml / .hera)
    val exportPresetLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/xml")
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val xml = PresetRepository.serializePresetToXml(currentPreset.name, paramState)
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(xml.toByteArray(Charsets.UTF_8))
                }
                Toast.makeText(context, "Voicing exportado: ${currentPreset.name}", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(context, "Erro ao exportar arquivo de voicing", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // SAF Preset Import Launcher (.xml / .hera)
    val importPresetLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val xml = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                if (!xml.isNullOrBlank()) {
                    val parsed = PresetRepository.parsePresetFromXml(xml, 100 + userPresets.size)
                    if (parsed != null) {
                        userPresets = PresetRepository.saveUserPreset(context, parsed)
                        for ((p, v) in parsed.values) {
                            onUpdateParam(p, v)
                        }
                        val newAll = PresetRepository.FACTORY_PRESETS + userPresets
                        val idx = newAll.indexOfFirst { it.name == parsed.name }
                        if (idx >= 0) currentPresetIndex = idx
                        Toast.makeText(context, "Voicing importado: ${parsed.name}", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(context, "Arquivo XML/.hera inválido", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Falha ao ler arquivo de voicing", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val applyPreset: (Int) -> Unit = { idx ->
        val safeIdx = (idx + allPresets.size) % allPresets.size
        currentPresetIndex = safeIdx
        val target = allPresets[safeIdx]
        for ((p, v) in target.values) {
            // Preserve global MasterVolume and global Reverb settings on preset change (like web version)
            if (p == SynthParam.MasterVolume ||
                p == SynthParam.ReverbEnabled ||
                p == SynthParam.ReverbType ||
                p == SynthParam.ReverbTime ||
                p == SynthParam.ReverbDecay ||
                p == SynthParam.ReverbMix
            ) {
                continue
            }
            onUpdateParam(p, v)
        }
    }

    // Force read uiRevision so Compose recomposes when MIDI Learn / Profile updates
    val rev = uiRevision
    val activeProfile = remember(rev) { midiManager.getActiveProfile() }
    val keysCh = activeProfile.sectionChannels[MidiSection.KEYS] ?: 0
    val mappedCount = activeProfile.paramToCC.size

    val mainVerticalScroll = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(JunoBgDark)
    ) {
        // Left Vintage Walnut / Rosewood Side Cheek
        Box(
            modifier = Modifier
                .width(10.dp)
                .fillMaxHeight()
                .background(Brush.horizontalGradient(listOf(JunoWoodDark, JunoWoodLight, JunoWoodDark)))
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .verticalScroll(mainVerticalScroll)
        ) {
            // 1. TOP ROLAND HEADER BAR (Branding + Voices + Scope + Distinct MIDI & Master Controls)
            TopHeaderBar(
                activeVoiceCount = activeVoiceCount,
                waveformSamples = waveformSamples,
                waveformTick = waveformTick,
                masterVolume = paramState[SynthParam.MasterVolume] ?: 0.8f,
                isMasterMuted = isMasterMuted,
                onToggleMasterMute = {
                    val currentVol = paramState[SynthParam.MasterVolume] ?: 0.8f
                    if (!isMasterMuted) {
                        preMuteMasterVolume = if (currentVol > 0.01f) currentVol else 0.8f
                        isMasterMuted = true
                        onUpdateParam(SynthParam.MasterVolume, 0f)
                    } else {
                        isMasterMuted = false
                        onUpdateParam(SynthParam.MasterVolume, preMuteMasterVolume)
                    }
                },
                onMasterVolumeChange = {
                    isMasterMuted = it <= 0.001f
                    onUpdateParam(SynthParam.MasterVolume, it)
                },
                midiManager = midiManager,
                uiRevision = rev,
                keysChannel = keysCh,
                profileName = activeProfile.name,
                mappedCount = mappedCount,
                isMidiLearn = midiManager.isMidiLearnActive,
                learningTargetKey = midiManager.learningTargetKey,
                onToggleMidiLearn = {
                    midiManager.isMidiLearnActive = !midiManager.isMidiLearnActive
                    if (!midiManager.isMidiLearnActive) {
                        midiManager.learningTargetKey = null
                    }
                    onNotifyUiChanged()
                },
                onNotifyUiChanged = onNotifyUiChanged,
                onOpenChannelsModal = { showChannelsDialog = true },
                onOpenProfileModal = { showProfileDialog = true },
                showKeyboard = showKeyboard,
                onToggleKeyboard = { showKeyboard = !showKeyboard },
                onPanic = {
                    holdSustain = false
                    onPanicAllNotesOff()
                }
            )

            // Signature Roland Juno-60 5-Color Metallic Accent Stripe
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(5.dp)
            ) {
                Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFDC2626)))
                Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFD97706)))
                Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFEAB308)))
                Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF06B6D4)))
                Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF2563EB)))
            }

            // 2. MAIN HORIZONTAL SCROLLABLE SYNTHESIZER RACK (Fixed comfortable height - never squished!)
            val rackScrollState = rememberScrollState()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(258.dp)
                    .background(JunoPanelBg)
                    .horizontalScroll(rackScrollState)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // SECTION 1: LFO
                SynthModuleCard(
                    title = "LFO",
                    footer = "VIBRATO OSC",
                    accentColor = Color(0xFFEAB308)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        JunoParamFader(
                            param = SynthParam.LFORate,
                            value = paramState[SynthParam.LFORate] ?: 0.6f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.LFORate, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.LFODelay,
                            value = paramState[SynthParam.LFODelay] ?: 0.0f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.LFODelay, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        Column(
                            verticalArrangement = Arrangement.SpaceBetween,
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.fillMaxHeight().padding(vertical = 4.dp)
                        ) {
                            SelectorGroupBox(
                                title = "LFO TRIG",
                                options = listOf("MAN", "AUTO"),
                                selectedIndex = (paramState[SynthParam.LFOTrigMode] ?: 1f).roundToInt().coerceIn(0, 1),
                                onSelect = { onUpdateParam(SynthParam.LFOTrigMode, it.toFloat()) }
                            )
                            val manTrigActive = (paramState[SynthParam.LFOManualTrig] ?: 0f) >= 0.5f
                            JunoParamSwitchWithBadge(
                                param = SynthParam.LFOManualTrig,
                                active = manTrigActive,
                                activeLabel = "MAN TRIG",
                                inactiveLabel = "MAN TRIG",
                                activeColor = JunoAmberLed,
                                midiManager = midiManager,
                                uiRevision = rev,
                                onToggle = {
                                    onUpdateParam(SynthParam.LFOManualTrig, if (manTrigActive) 0f else 1f)
                                },
                                onNotifyUiChanged = onNotifyUiChanged
                            )
                        }
                    }
                }

                // SECTION 2: DCO (OSCILLATOR)
                SynthModuleCard(
                    title = "DCO (OSCILLATOR)",
                    footer = "POLYBLEP ANALOG WAVEFORMS",
                    accentColor = JunoRed
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.fillMaxHeight().padding(vertical = 2.dp)
                        ) {
                            SelectorGroupBox(
                                title = "RANGE",
                                options = listOf("16'", "8'", "4'"),
                                selectedIndex = (paramState[SynthParam.DCORange] ?: 1f).roundToInt().coerceIn(0, 2),
                                onSelect = { onUpdateParam(SynthParam.DCORange, it.toFloat()) }
                            )
                            SelectorGroupBox(
                                title = "PWM",
                                options = listOf("MAN", "LFO", "ENV"),
                                selectedIndex = (paramState[SynthParam.DCOPWMMod] ?: 1f).roundToInt().coerceIn(0, 2),
                                onSelect = { onUpdateParam(SynthParam.DCOPWMMod, it.toFloat()) }
                            )
                        }

                        JunoParamFader(
                            param = SynthParam.DCOPitchModDepth,
                            value = paramState[SynthParam.DCOPitchModDepth] ?: 0f,
                            capColor = JunoRed,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DCOPitchModDepth, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DCOPWMDepth,
                            value = paramState[SynthParam.DCOPWMDepth] ?: 0.3f,
                            capColor = JunoRed,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DCOPWMDepth, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DCOPulseLevel,
                            value = paramState[SynthParam.DCOPulseLevel] ?: 0f,
                            capColor = JunoRed,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DCOPulseLevel, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DCOSawLevel,
                            value = paramState[SynthParam.DCOSawLevel] ?: 1f,
                            capColor = JunoRed,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DCOSawLevel, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DCOSubLevel,
                            value = paramState[SynthParam.DCOSubLevel] ?: 0f,
                            capColor = JunoRed,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DCOSubLevel, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DCONoiseLevel,
                            value = paramState[SynthParam.DCONoiseLevel] ?: 0f,
                            capColor = JunoRed,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DCONoiseLevel, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }

                // SECTION 3: HPF
                SynthModuleCard(
                    title = "HPF",
                    footer = "4-WAY",
                    accentColor = JunoBlue
                ) {
                    JunoParamFader(
                        param = SynthParam.HPF,
                        value = paramState[SynthParam.HPF] ?: 0f,
                        capColor = JunoBlue,
                        midiManager = midiManager,
                        uiRevision = rev,
                        onValueChange = { onUpdateParam(SynthParam.HPF, it) },
                        onNotifyUiChanged = onNotifyUiChanged
                    )
                }

                // SECTION 4: VCF (FILTER)
                SynthModuleCard(
                    title = "VCF (FILTER)",
                    footer = "24dB/OCT RESONANT OTA",
                    accentColor = JunoBlue
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        JunoParamFader(
                            param = SynthParam.VCFCutoff,
                            value = paramState[SynthParam.VCFCutoff] ?: 0.7f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCFCutoff, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.VCFResonance,
                            value = paramState[SynthParam.VCFResonance] ?: 0f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCFResonance, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.VCFEnv,
                            value = paramState[SynthParam.VCFEnv] ?: 0f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCFEnv, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.VCFLFO,
                            value = paramState[SynthParam.VCFLFO] ?: 0f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCFLFO, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.VCFKey,
                            value = paramState[SynthParam.VCFKey] ?: 1f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCFKey, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.VCFBendDepth,
                            value = paramState[SynthParam.VCFBendDepth] ?: 0f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCFBendDepth, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }

                // SECTION 5: VCA
                SynthModuleCard(
                    title = "VCA",
                    footer = "AMP",
                    accentColor = JunoOrange
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        SelectorGroupBox(
                            title = "TYPE",
                            options = listOf("ENV", "GATE"),
                            selectedIndex = (paramState[SynthParam.VCAType] ?: 0f).roundToInt().coerceIn(0, 1),
                            onSelect = { onUpdateParam(SynthParam.VCAType, it.toFloat()) }
                        )
                        JunoParamFader(
                            param = SynthParam.VCADepth,
                            value = paramState[SynthParam.VCADepth] ?: 0.5f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.VCADepth, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }

                // SECTION 6: ENV (ADSR)
                SynthModuleCard(
                    title = "ENV (ADSR)",
                    footer = "EXPONENTIAL ADSR",
                    accentColor = JunoOrange
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        JunoParamFader(
                            param = SynthParam.ENVAttack,
                            value = paramState[SynthParam.ENVAttack] ?: 0.4f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ENVAttack, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.ENVDecay,
                            value = paramState[SynthParam.ENVDecay] ?: 0f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ENVDecay, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.ENVSustain,
                            value = paramState[SynthParam.ENVSustain] ?: 1f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ENVSustain, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.ENVRelease,
                            value = paramState[SynthParam.ENVRelease] ?: 0.45f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ENVRelease, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }

                // SECTION 7: CHORUS BBD
                val c1 = (paramState[SynthParam.ChorusI] ?: 0f) >= 0.5f
                val c2 = (paramState[SynthParam.ChorusII] ?: 0f) >= 0.5f
                val chorusFooter = when {
                    c1 && c2 -> "I+II (ROTARY)"
                    c1 -> "I (LUSH)"
                    c2 -> "II (CREAMY)"
                    else -> "BBD OFF"
                }
                SynthModuleCard(
                    title = "CHORUS",
                    footer = chorusFooter,
                    accentColor = Color(0xFFF43F5E)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxHeight().padding(horizontal = 4.dp)
                    ) {
                        JunoChorusButton(
                            param = SynthParam.ChorusI,
                            romanLabel = "I",
                            active = c1,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onToggle = { onUpdateParam(SynthParam.ChorusI, if (c1) 0f else 1f) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoChorusButton(
                            param = SynthParam.ChorusII,
                            romanLabel = "II",
                            active = c2,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onToggle = { onUpdateParam(SynthParam.ChorusII, if (c2) 0f else 1f) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }

                // SECTION 8: ECHO DELAY
                val delayOn = (paramState[SynthParam.DelayEnabled] ?: 0f) >= 0.5f
                SynthModuleCard(
                    title = "ECHO DELAY",
                    footer = if (delayOn) "STEREO TAPE ECHO" else "BYPASS",
                    accentColor = JunoGreenReady,
                    headerRight = {
                        JunoParamSwitchWithBadge(
                            param = SynthParam.DelayEnabled,
                            active = delayOn,
                            activeLabel = "ON",
                            inactiveLabel = "OFF",
                            activeColor = JunoGreenReady,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onToggle = { onUpdateParam(SynthParam.DelayEnabled, if (delayOn) 0f else 1f) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        JunoParamFader(
                            param = SynthParam.DelayTime,
                            value = paramState[SynthParam.DelayTime] ?: 0.35f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DelayTime, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DelayFeedback,
                            value = paramState[SynthParam.DelayFeedback] ?: 0.35f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DelayFeedback, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.DelayMix,
                            value = paramState[SynthParam.DelayMix] ?: 0.25f,
                            capColor = JunoOrange,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.DelayMix, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }

                // SECTION 9: REVERB GLOBAL (POST-PROCESSING PLATE & HALL)
                val reverbOn = (paramState[SynthParam.ReverbEnabled] ?: 0f) >= 0.5f
                val reverbTypeIdx = (paramState[SynthParam.ReverbType] ?: 0f).roundToInt().coerceIn(0, 1)
                SynthModuleCard(
                    title = "REVERB GLOBAL",
                    footer = if (!reverbOn) "POST-FX BYPASS" else if (reverbTypeIdx == 0) "POST-FX STUDIO PLATE" else "POST-FX CONCERT HALL",
                    accentColor = JunoPurple,
                    headerRight = {
                        JunoParamSwitchWithBadge(
                            param = SynthParam.ReverbEnabled,
                            active = reverbOn,
                            activeLabel = "ON",
                            inactiveLabel = "OFF",
                            activeColor = JunoPurple,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onToggle = { onUpdateParam(SynthParam.ReverbEnabled, if (reverbOn) 0f else 1f) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        SelectorGroupBox(
                            title = "MODE",
                            options = listOf("PLATE", "HALL"),
                            selectedIndex = reverbTypeIdx,
                            onSelect = { onUpdateParam(SynthParam.ReverbType, it.toFloat()) }
                        )
                        JunoParamFader(
                            param = SynthParam.ReverbTime,
                            value = paramState[SynthParam.ReverbTime] ?: 0.35f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ReverbTime, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.ReverbDecay,
                            value = paramState[SynthParam.ReverbDecay] ?: 0.55f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ReverbDecay, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                        JunoParamFader(
                            param = SynthParam.ReverbMix,
                            value = paramState[SynthParam.ReverbMix] ?: 0.25f,
                            capColor = JunoBlue,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onValueChange = { onUpdateParam(SynthParam.ReverbMix, it) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                }
            }

            // 3. KEYBOARD & PERFORMANCE SECTION (VOICING / TIMBRES + ARPEGGIATOR + PIANO KEYBOARD)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF090B10))
                    .border(1.dp, Color(0xFF1F2433))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // 3A. VOICING / TIMBRES BAR (Preset Bank/Patch + Save + Download XML + Upload XML + Timbres Browser)
                VoicingPresetBar(
                    presetIndex = currentPresetIndex,
                    preset = currentPreset,
                    totalPresets = allPresets.size,
                    userPresetCount = userPresets.size,
                    onPrevPreset = { applyPreset(currentPresetIndex - 1) },
                    onNextPreset = { applyPreset(currentPresetIndex + 1) },
                    onOpenPresetList = { showPresetsDialog = true },
                    onSaveUserPreset = { showSavePresetDialog = true },
                    onExportPreset = {
                        val safeName = currentPreset.name.replace(Regex("[^a-zA-Z0-9_-]"), "_")
                        exportPresetLauncher.launch("$safeName.xml")
                    },
                    onImportPreset = {
                        importPresetLauncher.launch(arrayOf("*/*"))
                    }
                )

                // 3B. ARPEGGIATOR BAR (Inside Keyboard Section, matching web Arpeggiator drawer)
                ArpeggiatorKeyboardBar(
                    arpEnabled = arpEnabled,
                    onToggleArp = {
                        arpEnabled = !arpEnabled
                        if (!arpEnabled && !holdSustain) onPanicAllNotesOff()
                    },
                    arpMode = arpMode,
                    onSelectArpMode = { arpMode = it },
                    arpRange = arpRange,
                    onSelectArpRange = { arpRange = it },
                    arpRateDiv = arpRateDiv,
                    onSelectArpRateDiv = { arpRateDiv = it },
                    arpBpm = arpBpm,
                    onArpBpmChange = { arpBpm = it },
                    holdSustain = holdSustain,
                    onToggleHold = {
                        val next = !holdSustain
                        holdSustain = next
                        if (!next) onPanicAllNotesOff()
                    },
                    arpExpanded = arpExpanded,
                    onToggleExpanded = { arpExpanded = !arpExpanded },
                    showKeyboard = showKeyboard,
                    onToggleKeyboard = { showKeyboard = !showKeyboard }
                )

                // 3C. KEYBOARD CONTROLS + BENDER/MOD WHEELS + MULTI-TOUCH POLYPHONIC KEYBOARD
                if (showKeyboard) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(172.dp)
                            .background(Color(0xFF0A0C10), RoundedCornerShape(6.dp))
                            .border(1.dp, Color(0xFF222634), RoundedCornerShape(6.dp))
                            .padding(horizontal = 6.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Left Bender / Mod Wheel / Octave / Hold Panel
                        Column(
                            modifier = Modifier
                                .width(136.dp)
                                .fillMaxHeight()
                                .background(Color(0xFF12151E), RoundedCornerShape(6.dp))
                                .border(1.dp, Color(0xFF282E40), RoundedCornerShape(6.dp))
                                .padding(6.dp),
                            verticalArrangement = Arrangement.SpaceBetween,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            // Octave Selector Row + Hold Badge
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                    modifier = Modifier
                                        .background(Color(0xFF090B10), RoundedCornerShape(4.dp))
                                        .border(1.dp, Color(0xFF252C3D), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 4.dp, vertical = 2.dp)
                                ) {
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(3.dp))
                                            .background(Color(0xFF1B202E))
                                            .clickable { baseOctave = (baseOctave - 1).coerceIn(1, 5) }
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("-", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                    Text(
                                        text = "C$baseOctave",
                                        color = JunoAmberLed,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontFamily = FontFamily.Monospace,
                                        modifier = Modifier.padding(horizontal = 2.dp)
                                    )
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(3.dp))
                                            .background(Color(0xFF1B202E))
                                            .clickable { baseOctave = (baseOctave + 1).coerceIn(1, 5) }
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("+", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                }

                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (holdSustain) JunoAmberLed else Color(0xFF181C28))
                                        .border(
                                            1.dp,
                                            if (holdSustain) Color(0xFFFDE68A) else Color(0xFF2D3548),
                                            RoundedCornerShape(4.dp)
                                        )
                                        .clickable {
                                            val next = !holdSustain
                                            holdSustain = next
                                            if (!next) onPanicAllNotesOff()
                                        }
                                        .padding(horizontal = 6.dp, vertical = 3.dp)
                                ) {
                                    Text(
                                        text = "HOLD",
                                        color = if (holdSustain) Color.Black else Color(0xFF9CA3AF),
                                        fontSize = 8.5.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }
                            }

                            // Pitch Bend (Spring-back to 0)
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("PITCH BEND", color = Color(0xFF9CA3AF), fontSize = 8.5.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = if (kotlin.math.abs(pitchBendUi) < 0.02f) "CTR" else "${(pitchBendUi * 100).roundToInt()}%",
                                        color = JunoRed,
                                        fontSize = 8.5.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(Modifier.height(2.dp))
                                HorizontalTouchStrip(
                                    value = (pitchBendUi + 1f) * 0.5f,
                                    accentColor = JunoRed,
                                    springCenter = true,
                                    width = 120.dp,
                                    onChange = { norm ->
                                        pitchBendUi = (norm * 2f - 1f).coerceIn(-1f, 1f)
                                        NativeSynthBridge.setPitchBend(pitchBendUi, modWheelUi)
                                    },
                                    onRelease = {
                                        pitchBendUi = 0f
                                        NativeSynthBridge.setPitchBend(0f, modWheelUi)
                                    }
                                )
                            }

                            // Mod Wheel
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("MOD / LFO", color = Color(0xFF9CA3AF), fontSize = 8.5.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = "${(modWheelUi * 100).roundToInt()}%",
                                        color = JunoOrange,
                                        fontSize = 8.5.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(Modifier.height(2.dp))
                                HorizontalTouchStrip(
                                    value = modWheelUi,
                                    accentColor = JunoOrange,
                                    springCenter = false,
                                    width = 120.dp,
                                    onChange = { norm ->
                                        modWheelUi = norm.coerceIn(0f, 1f)
                                        NativeSynthBridge.setPitchBend(pitchBendUi, modWheelUi)
                                    },
                                    onRelease = {}
                                )
                            }
                        }

                        // Multi-Touch Polyphonic Piano Keyboard (2.5 Octaves: 30 keys)
                        val startMidiNote = baseOctave * 12 + 12 // C3 = 48
                        MultiTouchPolyphonicKeyboard(
                            startNote = startMidiNote,
                            numSemitones = 29,
                            activeNotes = activeNotes,
                            onNoteOn = onTriggerNoteOn,
                            onNoteOff = { note ->
                                if (!holdSustain) {
                                    onTriggerNoteOff(note)
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                        )
                    }
                }
            }
        }

        // Right Vintage Walnut / Rosewood Side Cheek
        Box(
            modifier = Modifier
                .width(10.dp)
                .fillMaxHeight()
                .background(Brush.horizontalGradient(listOf(JunoWoodDark, JunoWoodLight, JunoWoodDark)))
        )
    }

    // MODAL 1: MIDI CHANNELS BY SECTION
    if (showChannelsDialog) {
        MidiChannelsDialog(
            midiManager = midiManager,
            uiRevision = rev,
            onNotifyUiChanged = onNotifyUiChanged,
            onDismiss = { showChannelsDialog = false }
        )
    }

    // MODAL 2: MIDI PROFILE SELECTOR
    if (showProfileDialog) {
        MidiProfileDialog(
            midiManager = midiManager,
            onNotifyUiChanged = onNotifyUiChanged,
            onDismiss = { showProfileDialog = false }
        )
    }

    // MODAL 3: VOICING / TIMBRES PRESET BROWSER (with Search, Categories & User Preset Delete)
    if (showPresetsDialog) {
        PresetBrowserDialog(
            presets = allPresets,
            currentIndex = currentPresetIndex,
            onSelectPreset = { idx ->
                applyPreset(idx)
                showPresetsDialog = false
            },
            onDeleteUserPreset = { presetToDelete ->
                userPresets = PresetRepository.deleteUserPreset(context, presetToDelete.name)
                val newAll = PresetRepository.FACTORY_PRESETS + userPresets
                if (currentPresetIndex >= newAll.size) {
                    currentPresetIndex = 0
                }
                Toast.makeText(context, "Timbre removido: ${presetToDelete.name}", Toast.LENGTH_SHORT).show()
            },
            onDismiss = { showPresetsDialog = false }
        )
    }

    // MODAL 4: SAVE USER VOICING / PRESET
    if (showSavePresetDialog) {
        SavePresetDialog(
            initialName = "${currentPreset.name.removeSuffix(" (Custom)")} (Custom)",
            onConfirmSave = { newName ->
                val newPreset = HeraPreset(
                    id = 100 + userPresets.size,
                    name = newName,
                    isUserPreset = true,
                    values = paramState.toMap()
                )
                userPresets = PresetRepository.saveUserPreset(context, newPreset)
                val newAll = PresetRepository.FACTORY_PRESETS + userPresets
                val idx = newAll.indexOfFirst { it.name.equals(newName, ignoreCase = true) }
                if (idx >= 0) currentPresetIndex = idx
                showSavePresetDialog = false
                Toast.makeText(context, "Voicing salvo: $newName", Toast.LENGTH_SHORT).show()
            },
            onDismiss = { showSavePresetDialog = false }
        )
    }
}

/**
 * Custom Native Canvas Icon reproducing the Atari Cartridge + Synthwave Sun + Roland Juno-60 Hero Icon
 * from the web version's AtariCartridgeIcon.tsx.
 */
@Composable
private fun AtariCartridgeBadgeIcon(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(7.dp))
            .background(Color(0xFF0E1016))
            .border(1.dp, Color(0xFF323846), RoundedCornerShape(7.dp))
            .padding(2.dp)
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height

            // Twilight synthwave sky background
            drawRoundRect(
                brush = Brush.verticalGradient(
                    listOf(Color(0xFF0F1026), Color(0xFF3B1954), Color(0xFF18132B))
                ),
                topLeft = Offset.Zero,
                size = Size(w, h),
                cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
            )

            // Retrowave Sun
            drawCircle(
                brush = Brush.verticalGradient(
                    listOf(Color(0xFFFCD34D), Color(0xFFF97316), Color(0xFFEC4899))
                ),
                radius = w * 0.27f,
                center = Offset(w * 0.5f, h * 0.40f)
            )

            // Cyan horizon line
            drawLine(
                color = Color(0xFF06B6D4),
                start = Offset(0f, h * 0.62f),
                end = Offset(w, h * 0.62f),
                strokeWidth = 1.5f
            )

            // Mini Juno-60 Synth Chassis at bottom
            val synthTop = h * 0.56f
            val synthH = h * 0.34f
            drawRoundRect(
                color = Color(0xFF181920),
                topLeft = Offset(w * 0.12f, synthTop),
                size = Size(w * 0.76f, synthH),
                cornerRadius = CornerRadius(2.dp.toPx(), 2.dp.toPx())
            )

            // Wood cheeks
            drawRect(
                color = JunoWoodLight,
                topLeft = Offset(w * 0.08f, synthTop),
                size = Size(w * 0.06f, synthH)
            )
            drawRect(
                color = JunoWoodLight,
                topLeft = Offset(w * 0.86f, synthTop),
                size = Size(w * 0.06f, synthH)
            )

            // Rainbow stripe
            drawLine(
                color = JunoRed,
                start = Offset(w * 0.14f, synthTop + 2f),
                end = Offset(w * 0.86f, synthTop + 2f),
                strokeWidth = 2f
            )
            drawLine(
                color = JunoBlue,
                start = Offset(w * 0.14f, synthTop + 4f),
                end = Offset(w * 0.86f, synthTop + 4f),
                strokeWidth = 1.5f
            )

            // Mini white piano keys strip
            val keysTop = synthTop + synthH * 0.58f
            val keysH = synthH * 0.36f
            drawRect(
                color = Color(0xFFF3F0E6),
                topLeft = Offset(w * 0.15f, keysTop),
                size = Size(w * 0.70f, keysH)
            )
        }
    }
}

/**
 * Decluttered Top Roland Header Bar with:
 * - Complete App Branding (Atari Cartridge Juno Icon + HERA + JUNO-60 red badge + Subtitle description)
 * - 6-Voice Polyphony LED Bezel
 * - 60fps CRT Oscilloscope
 * - Visually Differentiated Control Sections:
 *   1. MIDI Routing & Profile Container (MIDI LED + CANAIS + Divider + PERFIL)
 *   2. Prominent MIDI LEARN Button with mapped count pill
 *   3. Master Volume Control (Mute toggle + Slider + Digital readout + MIDI Learn support)
 *   4. Keyboard Toggle & Panic buttons
 */
@Composable
private fun TopHeaderBar(
    activeVoiceCount: Int,
    waveformSamples: FloatArray,
    waveformTick: Int,
    masterVolume: Float,
    isMasterMuted: Boolean,
    onToggleMasterMute: () -> Unit,
    onMasterVolumeChange: (Float) -> Unit,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    keysChannel: Int,
    profileName: String,
    mappedCount: Int,
    isMidiLearn: Boolean,
    learningTargetKey: String?,
    onToggleMidiLearn: () -> Unit,
    onNotifyUiChanged: () -> Unit,
    onOpenChannelsModal: () -> Unit,
    onOpenProfileModal: () -> Unit,
    showKeyboard: Boolean,
    onToggleKeyboard: () -> Unit,
    onPanic: () -> Unit
) {
    val headerScroll = rememberScrollState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.horizontalGradient(
                    listOf(Color(0xFF090A0F), Color(0xFF12151E), Color(0xFF090A0F))
                )
            )
            .horizontalScroll(headerScroll)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        // LEFT: Complete App Branding (Icon + Title + JUNO-60 Badge + Description)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AtariCartridgeBadgeIcon(modifier = Modifier.size(38.dp))

            Column(verticalArrangement = Arrangement.Center) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "HERA",
                        color = Color(0xFFF3F4F6),
                        fontSize = 17.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 2.sp
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFFDC2626))
                            .padding(horizontal = 5.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = "JUNO-60",
                            color = Color.White,
                            fontSize = 9.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 1.sp
                        )
                    }
                }
                Text(
                    text = "POLYPHONIC SYNTHESIZER • 6 VOICES • STEREO BBD CHORUS",
                    color = Color(0xFF9CA3AF),
                    fontSize = 8.sp,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.5.sp
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        // CENTER-LEFT: 6-Voice Polyphony Indicator Box + Real-Time CRT Oscilloscope
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // 6-Voice Indicator Bezel
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .background(Color(0xFF080A0E), RoundedCornerShape(5.dp))
                    .border(1.dp, Color(0xFF1F2433), RoundedCornerShape(5.dp))
                    .padding(horizontal = 7.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "VOICES",
                    color = Color(0xFF6B7280),
                    fontSize = 7.5.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Spacer(Modifier.height(3.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (v in 0 until 6) {
                        val lit = v < activeVoiceCount
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(if (lit) JunoRed else Color(0xFF232734))
                                .border(
                                    0.5.dp,
                                    if (lit) Color(0xFFFCA5A5) else Color(0xFF374151),
                                    CircleShape
                                )
                        )
                    }
                }
            }

            // Real-time 60fps CRT Oscilloscope
            Box(
                modifier = Modifier
                    .width(110.dp)
                    .height(34.dp)
                    .background(Color(0xFF05100C), RoundedCornerShape(5.dp))
                    .border(1.dp, Color(0xFF1B4332), RoundedCornerShape(5.dp))
                    .padding(2.dp)
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val tickIgnore = waveformTick
                    if (tickIgnore >= 0) {
                        val w = size.width
                        val h = size.height
                        val midY = h * 0.5f
                        drawLine(
                            color = Color(0xFF143628),
                            start = Offset(0f, midY),
                            end = Offset(w, midY),
                            strokeWidth = 1f
                        )
                        val path = Path()
                        val n = waveformSamples.size
                        for (i in 0 until n) {
                            val x = (i.toFloat() / (n - 1).toFloat()) * w
                            val y = (midY - waveformSamples[i].coerceIn(-1f, 1f) * (h * 0.42f))
                            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                        }
                        drawPath(
                            path = path,
                            color = Color(0xFF34D399),
                            style = Stroke(width = 2f, cap = StrokeCap.Round)
                        )
                    }
                }
            }
        }

        Spacer(Modifier.width(12.dp))

        // RIGHT: Distinct Control Deck Container (Matching Web Header Control Box)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .background(Color(0xFF07090D), RoundedCornerShape(6.dp))
                .border(1.dp, Color(0xFF1F2533), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            // GROUP 1: MIDI Channels & Profile Selector Sub-Panel
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .background(Color(0xFF0D1017), RoundedCornerShape(5.dp))
                    .border(1.dp, Color(0xFF232A3B), RoundedCornerShape(5.dp))
                    .padding(horizontal = 7.dp, vertical = 3.dp)
            ) {
                // MIDI Status Indicator
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(JunoGreenReady)
                    )
                    Text(
                        text = "MIDI",
                        color = Color(0xFF9CA3AF),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }

                // CANAIS Button (Sky-Blue Styled with Amber T:CH badge)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFF131B29))
                        .border(1.dp, Color(0xFF0284C7), RoundedCornerShape(4.dp))
                        .clickable { onOpenChannelsModal() }
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = "≡ CANAIS",
                        color = Color(0xFF7DD3FC),
                        fontSize = 9.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF090C12), RoundedCornerShape(3.dp))
                            .border(1.dp, Color(0xFF283044), RoundedCornerShape(3.dp))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = "T:${if (keysChannel == 0) "OMNI" else "CH$keysChannel"}",
                            color = JunoAmberLed,
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                    Text(
                        text = "▾",
                        color = Color(0xFF38BDF8),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Vertical Divider inside MIDI Group
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(18.dp)
                        .background(Color(0xFF262E40))
                )

                // PERFIL Selector (Label + Emerald Dropdown Pill)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "PERFIL:",
                        color = JunoGreenReady,
                        fontSize = 8.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFF101F1B))
                            .border(1.dp, Color(0xFF059669), RoundedCornerShape(4.dp))
                            .clickable { onOpenProfileModal() }
                            .padding(horizontal = 6.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = profileName,
                            color = Color(0xFF6EE7B7),
                            fontSize = 9.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 1
                        )
                        Text(
                            text = "▾",
                            color = JunoGreenReady,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // GROUP 2: Visually Distinct MIDI LEARN Button with Mapped Counter Pill
            val learnLabel = when {
                !isMidiLearn -> "MIDI LEARN"
                learningTargetKey != null -> "AGUARDANDO CC..."
                else -> "TOQUE NO CONTROLE"
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(if (isMidiLearn) Color(0xFF0284C7) else Color(0xFF1F2430))
                    .border(
                        width = if (isMidiLearn) 1.5.dp else 1.dp,
                        color = if (isMidiLearn) Color(0xFF7DD3FC) else Color(0xFF374151),
                        shape = RoundedCornerShape(5.dp)
                    )
                    .clickable { onToggleMidiLearn() }
                    .padding(horizontal = 9.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "🎚",
                    fontSize = 10.sp,
                    color = if (isMidiLearn) Color.White else Color(0xFF38BDF8)
                )
                Text(
                    text = learnLabel,
                    color = if (isMidiLearn) Color.White else Color(0xFFE5E7EB),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(if (isMidiLearn) Color(0xFF082F49) else Color(0xFF111827))
                        .padding(horizontal = 5.dp, vertical = 1.dp)
                ) {
                    Text(
                        text = mappedCount.toString(),
                        color = if (isMidiLearn) Color(0xFF7DD3FC) else Color(0xFF9CA3AF),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // GROUP 3: Master Volume (Mappable when MIDI Learn is ON + Mute Toggle + Slider)
            val revIgnore = uiRevision
            val volMappedCC = remember(revIgnore) { midiManager.getMappedCC(SynthParam.MasterVolume.key) }
            val volMappedCh = remember(revIgnore) { midiManager.getMappedChannel(SynthParam.MasterVolume.key) }
            val isVolWaiting = isMidiLearn && midiManager.learningTargetKey == SynthParam.MasterVolume.key

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier
                    .background(
                        if (isVolWaiting) Color(0xFF0C2538) else Color(0xFF121620),
                        RoundedCornerShape(5.dp)
                    )
                    .border(
                        width = if (isVolWaiting) 1.5.dp else 1.dp,
                        color = when {
                            isVolWaiting -> JunoCyanLearn
                            isMidiLearn -> Color(0xFF0369A1)
                            else -> Color(0xFF283044)
                        },
                        shape = RoundedCornerShape(5.dp)
                    )
                    .clickable(enabled = isMidiLearn) {
                        midiManager.learningTargetKey = SynthParam.MasterVolume.key
                        onNotifyUiChanged()
                    }
                    .padding(horizontal = 7.dp, vertical = 3.dp)
            ) {
                if (isMidiLearn) {
                    Box(modifier = Modifier.width(56.dp)) {
                        MidiCcBalloonBadge(
                            mappedCC = volMappedCC,
                            mappedChannel = volMappedCh,
                            isLearnMode = true,
                            isWaitingCC = isVolWaiting,
                            onSelectForLearn = {
                                midiManager.learningTargetKey = SynthParam.MasterVolume.key
                                onNotifyUiChanged()
                            },
                            onClearMapping = {
                                midiManager.clearMappingForParam(SynthParam.MasterVolume.key)
                                onNotifyUiChanged()
                            }
                        )
                    }
                }
                Text(
                    text = if (isMasterMuted || masterVolume <= 0.001f) "🔇" else "🔊",
                    fontSize = 11.sp,
                    modifier = Modifier.clickable {
                        if (isMidiLearn) {
                            midiManager.learningTargetKey = SynthParam.MasterVolume.key
                            onNotifyUiChanged()
                        } else {
                            onToggleMasterMute()
                        }
                    }
                )
                HorizontalTouchStrip(
                    value = if (isMasterMuted) 0f else masterVolume,
                    accentColor = JunoAmberLed,
                    springCenter = false,
                    width = 64.dp,
                    onChange = {
                        if (isMidiLearn) {
                            midiManager.learningTargetKey = SynthParam.MasterVolume.key
                            onNotifyUiChanged()
                        } else {
                            onMasterVolumeChange(it)
                        }
                    },
                    onRelease = {}
                )
                Text(
                    text = "${((if (isMasterMuted) 0f else masterVolume) * 100).roundToInt()}",
                    color = JunoAmberLed,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // GROUP 4: Keyboard Visibility Toggle & Panic Button
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .clip(RoundedCornerShape(5.dp))
                        .background(if (showKeyboard) Color(0xFF271B0C) else Color(0xFF161922))
                        .border(
                            1.dp,
                            if (showKeyboard) JunoOrange else Color(0xFF2E3548),
                            RoundedCornerShape(5.dp)
                        )
                        .clickable { onToggleKeyboard() }
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = if (showKeyboard) "🎹 TECLADO ▲" else "🎹 TECLADO ▼",
                        color = if (showKeyboard) JunoAmberLed else Color(0xFF9CA3AF),
                        fontSize = 9.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }

                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .clip(RoundedCornerShape(5.dp))
                        .background(Color(0xFF241014))
                        .border(1.dp, Color(0xFF991B1B), RoundedCornerShape(5.dp))
                        .clickable { onPanic() }
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "PANIC",
                        color = Color(0xFFFCA5A5),
                        fontSize = 9.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
    }
}

/**
 * VOICING / TIMBRES Section inside the Keyboard/Performance area (matching Web PresetManager):
 * - Authentic Roland 7-Segment LED BANK and PATCH display
 * - Voicing/Timbre Name + Category/User Badge
 * - Prev (◀) & Next (▶) buttons
 * - SALVAR (Save User Voicing)
 * - DOWNLOAD (Export .XML / .hera Voicing)
 * - UPLOAD (Import .XML / .hera Voicing)
 * - TIMBRES Browser button
 */
@Composable
private fun VoicingPresetBar(
    presetIndex: Int,
    preset: HeraPreset,
    totalPresets: Int,
    userPresetCount: Int,
    onPrevPreset: () -> Unit,
    onNextPreset: () -> Unit,
    onOpenPresetList: () -> Unit,
    onSaveUserPreset: () -> Unit,
    onExportPreset: () -> Unit,
    onImportPreset: () -> Unit
) {
    val bankNumber = (presetIndex / 7) + 1
    val patchNumber = (presetIndex % 7) + 1
    val barScroll = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF12151E), RoundedCornerShape(6.dp))
            .border(1.dp, Color(0xFF282F42), RoundedCornerShape(6.dp))
            .horizontalScroll(barScroll)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        // LEFT: Authentic Roland 7-Segment LED Bezel Slot Display (BANK + PATCH + VOICING NAME)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .background(Color(0xFF07090D), RoundedCornerShape(5.dp))
                .border(1.dp, Color(0xFF1F2433), RoundedCornerShape(5.dp))
                .clickable { onOpenPresetList() }
                .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            // BANK 7-Segment Slot
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "BANK",
                    color = Color(0xFF9CA3AF),
                    fontSize = 7.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(24.dp)
                        .background(Color(0xFF160205), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF450A0A), RoundedCornerShape(4.dp))
                ) {
                    Text(
                        text = if (preset.isUserPreset) "U" else bankNumber.toString(),
                        color = Color(0xFFEF4444),
                        fontSize = 13.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // PATCH 7-Segment Slot
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "PATCH",
                    color = Color(0xFF9CA3AF),
                    fontSize = 7.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(24.dp)
                        .background(Color(0xFF160205), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF450A0A), RoundedCornerShape(4.dp))
                ) {
                    Text(
                        text = patchNumber.toString(),
                        color = Color(0xFFEF4444),
                        fontSize = 13.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // Vertical Divider
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(26.dp)
                    .background(Color(0xFF222838))
            )

            // VOICING / TIMBRE Name & Badge
            Column(
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.widthIn(min = 140.dp, max = 210.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Text(
                        text = "VOICING / TIMBRE",
                        color = Color(0xFF9CA3AF),
                        fontSize = 7.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                    Box(
                        modifier = Modifier
                            .background(
                                if (preset.isUserPreset) Color(0xFF082F49) else Color(0xFF1F2433),
                                RoundedCornerShape(3.dp)
                            )
                            .padding(horizontal = 4.dp, vertical = 0.5.dp)
                    ) {
                        Text(
                            text = if (preset.isUserPreset) "USER" else "FACTORY #${presetIndex.toString().padStart(2, '0')}",
                            color = if (preset.isUserPreset) Color(0xFF38BDF8) else Color(0xFF9CA3AF),
                            fontSize = 7.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
                Text(
                    text = preset.name,
                    color = JunoAmberLed,
                    fontSize = 13.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(Modifier.width(10.dp))

        // RIGHT: Voicing Navigation & Save / Download / Upload / Timbres Action Buttons
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // Prev Timbre
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF1B202E))
                    .border(1.dp, Color(0xFF323B4E), RoundedCornerShape(5.dp))
                    .clickable { onPrevPreset() }
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                Text("◀", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
            }

            // Next Timbre
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF1B202E))
                    .border(1.dp, Color(0xFF323B4E), RoundedCornerShape(5.dp))
                    .clickable { onNextPreset() }
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                Text("▶", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
            }

            // SALVAR Voicing (Save User Preset)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF231B0E))
                    .border(1.dp, JunoAmberLed, RoundedCornerShape(5.dp))
                    .clickable { onSaveUserPreset() }
                    .padding(horizontal = 9.dp, vertical = 5.dp)
            ) {
                Text("💾", fontSize = 10.sp)
                Text(
                    text = "SALVAR",
                    color = JunoAmberLed,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // DOWNLOAD (Export Voicing XML)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF0D211B))
                    .border(1.dp, JunoGreenReady, RoundedCornerShape(5.dp))
                    .clickable { onExportPreset() }
                    .padding(horizontal = 9.dp, vertical = 5.dp)
            ) {
                Text("⬇", color = JunoGreenReady, fontSize = 10.sp, fontWeight = FontWeight.Black)
                Text(
                    text = "DOWNLOAD XML",
                    color = Color(0xFF6EE7B7),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // UPLOAD (Import Voicing XML)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF0E1E2E))
                    .border(1.dp, JunoCyanLearn, RoundedCornerShape(5.dp))
                    .clickable { onImportPreset() }
                    .padding(horizontal = 9.dp, vertical = 5.dp)
            ) {
                Text("⬆", color = JunoCyanLearn, fontSize = 10.sp, fontWeight = FontWeight.Black)
                Text(
                    text = "UPLOAD XML",
                    color = Color(0xFF7DD3FC),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // TIMBRES / PRESETS Browser Button
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(5.dp))
                    .background(Color(0xFF291F0E))
                    .border(1.dp, Color(0xFFF59E0B), RoundedCornerShape(5.dp))
                    .clickable { onOpenPresetList() }
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                Text(
                    text = "TIMBRES ($totalPresets)",
                    color = Color(0xFFFBBF24),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
                if (userPresetCount > 0) {
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF090C12), RoundedCornerShape(3.dp))
                            .padding(horizontal = 4.dp, vertical = 0.5.dp)
                    ) {
                        Text(
                            text = "+$userPresetCount USER",
                            color = JunoCyanLearn,
                            fontSize = 8.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Text("▾", color = Color(0xFFFBBF24), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/**
 * Arpeggiator Bar inside the Keyboard Section (matching Web Arpeggiator.tsx):
 * Houses ARP ON/OFF, Mode (UP, U/D, DOWN), Range (1, 2, 3 Oct), Division (1/4, 1/8, 1/16),
 * HOLD toggle, and BPM control.
 */
@Composable
private fun ArpeggiatorKeyboardBar(
    arpEnabled: Boolean,
    onToggleArp: () -> Unit,
    arpMode: Int,
    onSelectArpMode: (Int) -> Unit,
    arpRange: Int,
    onSelectArpRange: (Int) -> Unit,
    arpRateDiv: Int,
    onSelectArpRateDiv: (Int) -> Unit,
    arpBpm: Float,
    onArpBpmChange: (Float) -> Unit,
    holdSustain: Boolean,
    onToggleHold: () -> Unit,
    arpExpanded: Boolean,
    onToggleExpanded: () -> Unit,
    showKeyboard: Boolean,
    onToggleKeyboard: () -> Unit
) {
    val modeNames = listOf("UP", "U/D", "DOWN")
    val rateLabels = listOf("1/4" to 4, "1/8" to 8, "1/16" to 16)
    val arpScroll = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0D0F16), RoundedCornerShape(6.dp))
            .border(1.dp, Color(0xFF232838), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        // Top compact line
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(arpScroll),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Main ARP ON/OFF Button
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (arpEnabled) Color(0xFFFBBF24) else Color(0xFF171B26))
                        .border(
                            1.dp,
                            if (arpEnabled) Color(0xFFFDE68A) else Color(0xFF32394E),
                            RoundedCornerShape(4.dp)
                        )
                        .clickable { onToggleArp() }
                        .padding(horizontal = 9.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = if (arpEnabled) "ARP ON" else "ARP OFF",
                        color = if (arpEnabled) Color.Black else Color(0xFF9CA3AF),
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black
                    )
                }

                // Quick Status Badges
                Box(
                    modifier = Modifier
                        .background(Color(0xFF141822), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF242B3D), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = modeNames.getOrElse(arpMode) { "UP" },
                        color = Color(0xFFD1D5DB),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }

                Box(
                    modifier = Modifier
                        .background(Color(0xFF141822), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF242B3D), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "$arpRange ${if (arpRange == 1) "OCT" else "OCTS"}",
                        color = Color(0xFFD1D5DB),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }

                Box(
                    modifier = Modifier
                        .background(Color(0xFF141822), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0xFF242B3D), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "${arpBpm.roundToInt()} BPM",
                        color = JunoAmberLed,
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }

                if (arpExpanded) {
                    // Inline Mode Selector
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier.padding(start = 4.dp)
                    ) {
                        Text(
                            text = "MODO:",
                            color = Color(0xFF6B7280),
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        for (i in modeNames.indices) {
                            val sel = arpMode == i
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (sel) JunoAmberLed else Color(0xFF161A25))
                                    .border(
                                        1.dp,
                                        if (sel) Color(0xFFFDE68A) else Color(0xFF293042),
                                        RoundedCornerShape(4.dp)
                                    )
                                    .clickable { onSelectArpMode(i) }
                                    .padding(horizontal = 6.dp, vertical = 2.5.dp)
                            ) {
                                Text(
                                    text = modeNames[i],
                                    color = if (sel) Color.Black else Color(0xFF9CA3AF),
                                    fontSize = 8.5.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                        }
                    }

                    // Inline Range Selector (Octaves)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier.padding(start = 4.dp)
                    ) {
                        Text(
                            text = "OITAVAS:",
                            color = Color(0xFF6B7280),
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        for (r in 1..3) {
                            val sel = arpRange == r
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (sel) JunoAmberLed else Color(0xFF161A25))
                                    .border(
                                        1.dp,
                                        if (sel) Color(0xFFFDE68A) else Color(0xFF293042),
                                        RoundedCornerShape(4.dp)
                                    )
                                    .clickable { onSelectArpRange(r) }
                                    .padding(horizontal = 6.dp, vertical = 2.5.dp)
                            ) {
                                Text(
                                    text = "${r}x",
                                    color = if (sel) Color.Black else Color(0xFF9CA3AF),
                                    fontSize = 8.5.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                        }
                    }

                    // Inline Rate Division Selector
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier.padding(start = 4.dp)
                    ) {
                        Text(
                            text = "DIV:",
                            color = Color(0xFF6B7280),
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        for ((label, divVal) in rateLabels) {
                            val sel = arpRateDiv == divVal
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (sel) Color(0xFF38BDF8) else Color(0xFF161A25))
                                    .border(
                                        1.dp,
                                        if (sel) Color(0xFFBAE6FD) else Color(0xFF293042),
                                        RoundedCornerShape(4.dp)
                                    )
                                    .clickable { onSelectArpRateDiv(divVal) }
                                    .padding(horizontal = 6.dp, vertical = 2.5.dp)
                            ) {
                                Text(
                                    text = label,
                                    color = if (sel) Color.Black else Color(0xFF9CA3AF),
                                    fontSize = 8.5.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                        }
                    }

                    // HOLD Toggle
                    Box(
                        modifier = Modifier
                            .padding(start = 4.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(if (holdSustain) JunoAmberLed else Color(0xFF161A25))
                            .border(
                                1.dp,
                                if (holdSustain) Color(0xFFFDE68A) else Color(0xFF293042),
                                RoundedCornerShape(4.dp)
                            )
                            .clickable { onToggleHold() }
                            .padding(horizontal = 7.dp, vertical = 2.5.dp)
                    ) {
                        Text(
                            text = if (holdSustain) "HOLD ON" else "HOLD OFF",
                            color = if (holdSustain) Color.Black else Color(0xFF9CA3AF),
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }

                    // BPM Horizontal Slider
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.padding(start = 4.dp)
                    ) {
                        Text(
                            text = "BPM:",
                            color = Color(0xFF6B7280),
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        HorizontalTouchStrip(
                            value = ((arpBpm - 40f) / 200f).coerceIn(0f, 1f),
                            accentColor = JunoAmberLed,
                            springCenter = false,
                            width = 76.dp,
                            onChange = { norm -> onArpBpmChange(40f + norm * 200f) },
                            onRelease = {}
                        )
                    }
                }
            }

            Spacer(Modifier.width(8.dp))

            // Right side: Collapse/Expand Arpeggiator & Show/Hide Keyboard Keys
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFF151924))
                        .border(1.dp, Color(0xFF2B3346), RoundedCornerShape(4.dp))
                        .clickable { onToggleExpanded() }
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = if (arpExpanded) "ARP AJUSTES ▲" else "ARP AJUSTES ▼",
                        color = Color(0xFFD1D5DB),
                        fontSize = 8.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (showKeyboard) Color(0xFF1D1710) else Color(0xFF151924))
                        .border(
                            1.dp,
                            if (showKeyboard) JunoOrange else Color(0xFF2B3346),
                            RoundedCornerShape(4.dp)
                        )
                        .clickable { onToggleKeyboard() }
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = if (showKeyboard) "OCULTAR TECLAS ▲" else "MOSTRAR TECLAS ▼",
                        color = if (showKeyboard) JunoAmberLed else Color(0xFF9CA3AF),
                        fontSize = 8.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun SynthModuleCard(
    title: String,
    footer: String,
    accentColor: Color,
    headerRight: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .background(Color(0xFF12151C), RoundedCornerShape(6.dp))
            .border(1.dp, JunoSectionBorder, RoundedCornerShape(6.dp))
    ) {
        // Top Colored Header Strip
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(accentColor)
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = title,
                color = accentColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.8.sp
            )
            if (headerRight != null) {
                Spacer(Modifier.width(8.dp))
                headerRight()
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 6.dp, vertical = 2.dp),
            contentAlignment = Alignment.Center
        ) {
            content()
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0D0F14))
                .padding(vertical = 3.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = footer,
                color = Color(0xFF6B7280),
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp
            )
        }
    }
}

/**
 * Vertical Juno-60 Fader with:
 * - 0..100 LED digital readout
 * - MIDI Learn badge ONLY visible when MIDI Learn mode is active (`if (isLearnMode)`)
 * - Line-break for Channel (CHxx) and line-break below text for clear button (✕)
 * - Safe horizontal margin so adjacent fader balloons never touch
 */
@Composable
private fun JunoParamFader(
    param: SynthParam,
    value: Float,
    capColor: Color,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onValueChange: (Float) -> Unit,
    onNotifyUiChanged: () -> Unit
) {
    val revIgnore = uiRevision
    val mappedCC = remember(revIgnore, param) { midiManager.getMappedCC(param.key) }
    val mappedCh = remember(revIgnore, param) { midiManager.getMappedChannel(param.key) }
    val isLearnMode = midiManager.isMidiLearnActive
    val isSelectedTarget = isLearnMode && midiManager.learningTargetKey == param.key

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(58.dp)
            .fillMaxHeight()
            .padding(horizontal = 3.dp)
            .background(
                color = if (isSelectedTarget) Color(0xFF0C2538) else Color(0xFF0E1117),
                shape = RoundedCornerShape(6.dp)
            )
            .border(
                width = if (isSelectedTarget) 1.5.dp else 1.dp,
                color = when {
                    isSelectedTarget -> JunoCyanLearn
                    isLearnMode -> Color(0xFF0369A1)
                    else -> Color(0xFF1F2637)
                },
                shape = RoundedCornerShape(6.dp)
            )
            .padding(vertical = 4.dp, horizontal = 2.dp)
    ) {
        // MIDI CC / Channel Multi-line Badge ONLY when MIDI Learn is active!
        if (isLearnMode) {
            MidiCcBalloonBadge(
                mappedCC = mappedCC,
                mappedChannel = mappedCh,
                isLearnMode = true,
                isWaitingCC = isSelectedTarget,
                onSelectForLearn = {
                    midiManager.learningTargetKey = param.key
                    onNotifyUiChanged()
                },
                onClearMapping = {
                    midiManager.clearMappingForParam(param.key)
                    onNotifyUiChanged()
                }
            )
            Spacer(Modifier.height(2.dp))
        }

        Text(
            text = param.label,
            color = Color(0xFFE5E7EB),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )

        // Vertical Fader Canvas
        val currentVal by rememberUpdatedState(value)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .pointerInput(isLearnMode, param.key) {
                    detectTapGestures { offset ->
                        if (isLearnMode) {
                            midiManager.learningTargetKey = param.key
                            onNotifyUiChanged()
                        } else {
                            val h = size.height.toFloat().coerceAtLeast(1f)
                            val newNorm = (1f - (offset.y / h)).coerceIn(0f, 1f)
                            onValueChange(newNorm)
                        }
                    }
                }
                .pointerInput(isLearnMode, param.key) {
                    detectDragGestures(
                        onDragStart = {
                            if (isLearnMode) {
                                midiManager.learningTargetKey = param.key
                                onNotifyUiChanged()
                            }
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            if (!isLearnMode) {
                                val h = size.height.toFloat().coerceAtLeast(1f)
                                val newNorm = (1f - (change.position.y / h)).coerceIn(0f, 1f)
                                onValueChange(newNorm)
                            }
                        }
                    )
                }
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height
                val padY = 12.dp.toPx()
                val usableH = (h - padY * 2f).coerceAtLeast(10f)
                val centerX = w * 0.5f

                // Scale ticks (0..10)
                for (i in 0..10) {
                    val ty = padY + usableH * (1f - i / 10f)
                    val tickW = if (i % 5 == 0) 8.dp.toPx() else 4.dp.toPx()
                    drawLine(
                        color = if (i % 5 == 0) Color(0xFF6B7280) else Color(0xFF374151),
                        start = Offset(centerX - 12.dp.toPx() - tickW, ty),
                        end = Offset(centerX - 12.dp.toPx(), ty),
                        strokeWidth = 1.2f
                    )
                    drawLine(
                        color = if (i % 5 == 0) Color(0xFF6B7280) else Color(0xFF374151),
                        start = Offset(centerX + 12.dp.toPx(), ty),
                        end = Offset(centerX + 12.dp.toPx() + tickW, ty),
                        strokeWidth = 1.2f
                    )
                }

                // Track Slot
                val trackW = 6.dp.toPx()
                drawRoundRect(
                    color = Color(0xFF05070A),
                    topLeft = Offset(centerX - trackW * 0.5f, padY),
                    size = Size(trackW, usableH),
                    cornerRadius = CornerRadius(trackW * 0.5f, trackW * 0.5f)
                )

                // Fader Cap
                val norm = currentVal.coerceIn(0f, 1f)
                val capY = padY + usableH * (1f - norm)
                val capW = 28.dp.toPx()
                val capH = 16.dp.toPx()

                drawRoundRect(
                    color = capColor,
                    topLeft = Offset(centerX - capW * 0.5f, capY - capH * 0.5f),
                    size = Size(capW, capH),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
                // Center dark indicator line on fader cap
                drawLine(
                    color = Color(0xFF111827),
                    start = Offset(centerX - capW * 0.32f, capY),
                    end = Offset(centerX + capW * 0.32f, capY),
                    strokeWidth = 2.2f
                )
            }
        }

        // Digital Readout (0 .. 100)
        Box(
            modifier = Modifier
                .background(Color(0xFF080A0F), RoundedCornerShape(3.dp))
                .border(1.dp, Color(0xFF1F2433), RoundedCornerShape(3.dp))
                .padding(horizontal = 6.dp, vertical = 1.dp)
        ) {
            Text(
                text = "${(value * 100f).roundToInt().coerceIn(0, 100)}",
                color = JunoAmberLed,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

/**
 * Balloon badge for MIDI CC + Channel + Clear button (✕)
 * Follows the exact user layout specification:
 * - Only displayed when MIDI Learn is active
 * - Line 1: CC number (or MAPEAR)
 * - Line 2: Channel (CHxx) on its own line below CC
 * - Line 3: Clear button (✕) on its own line below text
 */
@Composable
private fun MidiCcBalloonBadge(
    mappedCC: Int?,
    mappedChannel: Int?,
    isLearnMode: Boolean,
    isWaitingCC: Boolean,
    onSelectForLearn: () -> Unit,
    onClearMapping: () -> Unit
) {
    if (!isLearnMode) return

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(
                when {
                    isWaitingCC -> Color(0xFF0284C7)
                    mappedCC != null -> Color(0xFF0369A1)
                    else -> Color(0xFF1E293B)
                }
            )
            .border(
                width = 1.dp,
                color = if (isWaitingCC) Color.White else Color(0xFF38BDF8),
                shape = RoundedCornerShape(6.dp)
            )
            .clickable { onSelectForLearn() }
            .padding(horizontal = 3.dp, vertical = 2.dp)
    ) {
        // Line 1: CC or MAPEAR
        val topText = when {
            isWaitingCC -> "MAPEAR"
            mappedCC != null -> "CC$mappedCC"
            else -> "MAPEAR"
        }
        Text(
            text = topText,
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
            maxLines = 1
        )

        // Line 2: Mandatory line break for Channel when mapped
        if (mappedCC != null && mappedChannel != null && mappedChannel in 1..16) {
            Text(
                text = "CH$mappedChannel",
                color = Color(0xFFBAE6FD),
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }

        // Line 3: Mandatory line break for '✕' clear button below text
        if (mappedCC != null) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .padding(top = 1.dp)
                    .fillMaxWidth()
                    .background(Color(0x33000000), RoundedCornerShape(3.dp))
                    .clickable { onClearMapping() }
                    .padding(vertical = 1.dp)
            ) {
                Text(
                    text = "✕",
                    color = Color(0xFFFCA5A5),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun JunoChorusButton(
    param: SynthParam,
    romanLabel: String,
    active: Boolean,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onToggle: () -> Unit,
    onNotifyUiChanged: () -> Unit
) {
    val revIgnore = uiRevision
    val mappedCC = remember(revIgnore, param) { midiManager.getMappedCC(param.key) }
    val mappedCh = remember(revIgnore, param) { midiManager.getMappedChannel(param.key) }
    val isLearnMode = midiManager.isMidiLearnActive
    val isWaiting = isLearnMode && midiManager.learningTargetKey == param.key

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.width(54.dp)
    ) {
        if (isLearnMode) {
            MidiCcBalloonBadge(
                mappedCC = mappedCC,
                mappedChannel = mappedCh,
                isLearnMode = true,
                isWaitingCC = isWaiting,
                onSelectForLearn = {
                    midiManager.learningTargetKey = param.key
                    onNotifyUiChanged()
                },
                onClearMapping = {
                    midiManager.clearMappingForParam(param.key)
                    onNotifyUiChanged()
                }
            )
            Spacer(Modifier.height(4.dp))
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .width(46.dp)
                .height(68.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (active) Color(0xFF282218) else Color(0xFF171A24))
                .border(
                    width = 1.5.dp,
                    color = if (active) JunoAmberLed else Color(0xFF2E3646),
                    shape = RoundedCornerShape(6.dp)
                )
                .clickable {
                    if (isLearnMode) {
                        midiManager.learningTargetKey = param.key
                        onNotifyUiChanged()
                    } else {
                        onToggle()
                    }
                }
                .padding(6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(if (active) JunoAmberLed else Color(0xFF374151))
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = romanLabel,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun JunoParamSwitchWithBadge(
    param: SynthParam,
    active: Boolean,
    activeLabel: String,
    inactiveLabel: String,
    activeColor: Color,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onToggle: () -> Unit,
    onNotifyUiChanged: () -> Unit
) {
    val revIgnore = uiRevision
    val mappedCC = remember(revIgnore, param) { midiManager.getMappedCC(param.key) }
    val mappedCh = remember(revIgnore, param) { midiManager.getMappedChannel(param.key) }
    val isLearnMode = midiManager.isMidiLearnActive
    val isWaiting = isLearnMode && midiManager.learningTargetKey == param.key

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (isLearnMode) {
            Box(modifier = Modifier.width(54.dp)) {
                MidiCcBalloonBadge(
                    mappedCC = mappedCC,
                    mappedChannel = mappedCh,
                    isLearnMode = true,
                    isWaitingCC = isWaiting,
                    onSelectForLearn = {
                        midiManager.learningTargetKey = param.key
                        onNotifyUiChanged()
                    },
                    onClearMapping = {
                        midiManager.clearMappingForParam(param.key)
                        onNotifyUiChanged()
                    }
                )
            }
        }
        JunoToggleChip(
            label = if (active) activeLabel else inactiveLabel,
            active = active,
            activeColor = activeColor,
            onClick = {
                if (isLearnMode) {
                    midiManager.learningTargetKey = param.key
                    onNotifyUiChanged()
                } else {
                    onToggle()
                }
            }
        )
    }
}

@Composable
private fun SelectorGroupBox(
    title: String,
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
        modifier = Modifier
            .background(Color(0xFF0E1117), RoundedCornerShape(6.dp))
            .border(1.dp, Color(0xFF22293A), RoundedCornerShape(6.dp))
            .padding(horizontal = 5.dp, vertical = 4.dp)
    ) {
        Text(
            text = title,
            color = Color(0xFF9CA3AF),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold
        )
        for (i in options.indices) {
            val isSel = i == selectedIndex
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .width(42.dp)
                    .height(22.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (isSel) JunoOrange else Color(0xFF1A1E29))
                    .border(
                        1.dp,
                        if (isSel) JunoAmberLed else Color(0xFF2D3343),
                        RoundedCornerShape(4.dp)
                    )
                    .clickable { onSelect(i) }
            ) {
                Text(
                    text = options[i],
                    color = if (isSel) Color.Black else Color(0xFFD1D5DB),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
    }
}

@Composable
private fun JunoToggleChip(
    label: String,
    active: Boolean,
    activeColor: Color,
    onClick: () -> Unit
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(if (active) activeColor else Color(0xFF1B1F2B))
            .border(1.dp, if (active) Color.White else Color(0xFF32394E), RoundedCornerShape(4.dp))
            .clickable { onClick() }
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = label,
            color = if (active) Color.White else Color(0xFF9CA3AF),
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun SmallHeaderButton(
    text: String,
    bgColor: Color = Color(0xFF161922),
    borderColor: Color = Color(0xFF2E3548),
    textColor: Color = Color(0xFFE5E7EB),
    onClick: () -> Unit
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable { onClick() }
            .padding(horizontal = 7.dp, vertical = 4.dp)
    ) {
        Text(
            text = text,
            color = textColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun HorizontalTouchStrip(
    value: Float,
    accentColor: Color,
    springCenter: Boolean,
    width: Dp = 108.dp,
    onChange: (Float) -> Unit,
    onRelease: () -> Unit
) {
    val currentVal by rememberUpdatedState(value)
    Box(
        modifier = Modifier
            .width(width)
            .height(18.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(Color(0xFF080A0F))
            .border(1.dp, Color(0xFF272D3D), RoundedCornerShape(4.dp))
            .pointerInput(springCenter) {
                detectDragGestures(
                    onDragEnd = { onRelease() },
                    onDragCancel = { onRelease() },
                    onDrag = { change, _ ->
                        change.consume()
                        val w = size.width.toFloat().coerceAtLeast(1f)
                        onChange((change.position.x / w).coerceIn(0f, 1f))
                    }
                )
            }
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val x = currentVal.coerceIn(0f, 1f) * w
            if (springCenter) {
                val mid = w * 0.5f
                drawLine(
                    color = accentColor.copy(alpha = 0.5f),
                    start = Offset(mid, h * 0.5f),
                    end = Offset(x, h * 0.5f),
                    strokeWidth = h * 0.6f
                )
            } else {
                drawRect(
                    color = accentColor.copy(alpha = 0.45f),
                    topLeft = Offset(0f, 0f),
                    size = Size(x, h)
                )
            }
            drawRoundRect(
                color = accentColor,
                topLeft = Offset((x - 5.dp.toPx()).coerceIn(0f, w - 10.dp.toPx()), 1.dp.toPx()),
                size = Size(10.dp.toPx(), h - 2.dp.toPx()),
                cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx())
            )
        }
    }
}

/**
 * True Multi-Touch Polyphonic Keyboard in Jetpack Compose
 * Tracks multiple simultaneous fingers and glissandos across white and black keys.
 */
@Composable
private fun MultiTouchPolyphonicKeyboard(
    startNote: Int,
    numSemitones: Int,
    activeNotes: List<Int>,
    onNoteOn: (Int, Float) -> Unit,
    onNoteOff: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val isBlackKey = remember {
        booleanArrayOf(false, true, false, true, false, false, true, false, true, false, true, false)
    }

    val whiteNotes = remember(startNote, numSemitones) {
        (startNote until (startNote + numSemitones)).filter { !isBlackKey[it % 12] }
    }
    val blackNotes = remember(startNote, numSemitones) {
        (startNote until (startNote + numSemitones)).filter { isBlackKey[it % 12] }
    }

    val touchedNotesRef = remember { mutableStateOf(emptySet<Int>()) }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(Color(0xFF050608))
            .pointerInput(startNote, numSemitones) {
                awaitEachGesture {
                    while (true) {
                        val event = awaitPointerEvent()
                        val w = size.width.toFloat().coerceAtLeast(1f)
                        val h = size.height.toFloat().coerceAtLeast(1f)
                        val whiteCount = whiteNotes.size.coerceAtLeast(1)
                        val whiteKeyW = w / whiteCount.toFloat()
                        val blackKeyH = h * 0.60f
                        val blackKeyW = whiteKeyW * 0.62f

                        val newNotes = mutableSetOf<Int>()

                        for (change in event.changes) {
                            if (change.pressed) {
                                val px = change.position.x
                                val py = change.position.y
                                if (px in 0f..w && py in 0f..h) {
                                    var hitNote: Int? = null
                                    // Check Black Keys first (top layer)
                                    if (py <= blackKeyH) {
                                        for (bNote in blackNotes) {
                                            val prevWhiteIdx = whiteNotes.indexOfLast { it < bNote }
                                            if (prevWhiteIdx >= 0) {
                                                val centerX = (prevWhiteIdx + 1) * whiteKeyW
                                                val left = centerX - blackKeyW * 0.5f
                                                val right = centerX + blackKeyW * 0.5f
                                                if (px in left..right) {
                                                    hitNote = bNote
                                                    break
                                                }
                                            }
                                        }
                                    }
                                    // Fallback to White Key
                                    if (hitNote == null) {
                                        val wIdx = (px / whiteKeyW).toInt().coerceIn(0, whiteCount - 1)
                                        hitNote = whiteNotes[wIdx]
                                    }
                                    newNotes.add(hitNote)
                                }
                            }
                        }

                        val oldNotes = touchedNotesRef.value
                        for (n in newNotes) {
                            if (!oldNotes.contains(n)) {
                                onNoteOn(n, 0.9f)
                            }
                        }
                        for (n in oldNotes) {
                            if (!newNotes.contains(n)) {
                                onNoteOff(n)
                            }
                        }
                        touchedNotesRef.value = newNotes

                        if (event.changes.none { it.pressed }) {
                            break
                        }
                    }
                }
            }
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val whiteCount = whiteNotes.size.coerceAtLeast(1)
            val whiteKeyW = w / whiteCount.toFloat()
            val blackKeyH = h * 0.60f
            val blackKeyW = whiteKeyW * 0.62f

            // Draw White Keys
            for (i in whiteNotes.indices) {
                val note = whiteNotes[i]
                val isPressed = activeNotes.contains(note)
                val left = i * whiteKeyW
                drawRoundRect(
                    color = if (isPressed) JunoOrange else Color(0xFFF3F4F6),
                    topLeft = Offset(left + 1.dp.toPx(), 0f),
                    size = Size(whiteKeyW - 2.dp.toPx(), h - 2.dp.toPx()),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
            }

            // Draw Black Keys
            for (bNote in blackNotes) {
                val prevWhiteIdx = whiteNotes.indexOfLast { it < bNote }
                if (prevWhiteIdx >= 0) {
                    val isPressed = activeNotes.contains(bNote)
                    val centerX = (prevWhiteIdx + 1) * whiteKeyW
                    drawRoundRect(
                        color = if (isPressed) JunoRed else Color(0xFF111827),
                        topLeft = Offset(centerX - blackKeyW * 0.5f, 0f),
                        size = Size(blackKeyW, blackKeyH),
                        cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx())
                    )
                }
            }
        }
    }
}

@Composable
private fun MidiChannelsDialog(
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onNotifyUiChanged: () -> Unit,
    onDismiss: () -> Unit
) {
    val revIgnore = uiRevision
    val prof = remember(revIgnore) { midiManager.getActiveProfile() }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .width(440.dp)
                .heightIn(max = 360.dp)
                .background(Color(0xFF0E121B), RoundedCornerShape(10.dp))
                .border(1.5.dp, JunoCyanLearn, RoundedCornerShape(10.dp))
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "CANAIS MIDI POR SEÇÃO",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text(
                        text = "Salvo no perfil: ${prof.name}",
                        color = JunoGreenReady,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                SmallHeaderButton(text = "✕", onClick = onDismiss)
            }

            Spacer(Modifier.height(8.dp))

            // Apply to all FX sections quick bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF161B28), RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "APLICAR A TODAS SEÇÕES FX:",
                    color = JunoCyanLearn,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    SmallHeaderButton(
                        text = "OMNI",
                        onClick = {
                            midiManager.setAllFxSectionsChannel(0)
                            onNotifyUiChanged()
                        }
                    )
                    SmallHeaderButton(
                        text = "CH 01",
                        onClick = {
                            midiManager.setAllFxSectionsChannel(1)
                            onNotifyUiChanged()
                        }
                    )
                    SmallHeaderButton(
                        text = "CH 02",
                        onClick = {
                            midiManager.setAllFxSectionsChannel(2)
                            onNotifyUiChanged()
                        }
                    )
                    SmallHeaderButton(
                        text = "CH 06",
                        onClick = {
                            midiManager.setAllFxSectionsChannel(6)
                            onNotifyUiChanged()
                        }
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                for (sec in MidiSection.entries) {
                    val ch = prof.sectionChannels[sec] ?: 0
                    val isKeys = sec == MidiSection.KEYS
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF141824), RoundedCornerShape(6.dp))
                            .border(1.dp, Color(0xFF252C3F), RoundedCornerShape(6.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = sec.title,
                                color = if (isKeys) JunoAmberLed else Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = sec.subtitle,
                                color = Color(0xFF9CA3AF),
                                fontSize = 10.sp
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            SmallHeaderButton(
                                text = "-",
                                onClick = {
                                    val next = if (ch <= 0) 16 else ch - 1
                                    midiManager.setSectionChannel(sec, next)
                                    onNotifyUiChanged()
                                }
                            )
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier
                                    .width(68.dp)
                                    .background(Color(0xFF0A0D14), RoundedCornerShape(4.dp))
                                    .border(
                                        1.dp,
                                        if (isKeys) JunoAmberLed else JunoGreenReady,
                                        RoundedCornerShape(4.dp)
                                    )
                                    .padding(vertical = 4.dp)
                            ) {
                                Text(
                                    text = if (ch == 0) "OMNI" else "CH ${ch.toString().padStart(2, '0')}",
                                    color = if (isKeys) JunoAmberLed else JunoGreenReady,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            SmallHeaderButton(
                                text = "+",
                                onClick = {
                                    val next = (ch + 1) % 17
                                    midiManager.setSectionChannel(sec, next)
                                    onNotifyUiChanged()
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MidiProfileDialog(
    midiManager: MidiControllerManager,
    onNotifyUiChanged: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .width(380.dp)
                .background(Color(0xFF0E121B), RoundedCornerShape(10.dp))
                .border(1.5.dp, JunoGreenReady, RoundedCornerShape(10.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "PERFIL DE MAPEAMENTO MIDI",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                SmallHeaderButton(text = "✕", onClick = onDismiss)
            }

            for (prof in midiManager.profiles) {
                val isSelected = prof.id == midiManager.activeProfileId
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSelected) Color(0xFF0F2922) else Color(0xFF161B26))
                        .border(
                            1.dp,
                            if (isSelected) JunoGreenReady else Color(0xFF2B3346),
                            RoundedCornerShape(6.dp)
                        )
                        .clickable {
                            midiManager.selectProfile(prof.id)
                            onNotifyUiChanged()
                            onDismiss()
                        }
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = prof.name,
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${prof.paramToCC.size} controles mapeados",
                            color = Color(0xFF9CA3AF),
                            fontSize = 10.sp
                        )
                    }
                    if (isSelected) {
                        Text("ATIVO", color = JunoGreenReady, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                SmallHeaderButton(
                    text = "RESTAURAR PADRÃO DO PERFIL",
                    borderColor = JunoRed,
                    textColor = JunoRed,
                    onClick = {
                        midiManager.resetActiveProfileToFactory()
                        onNotifyUiChanged()
                        onDismiss()
                    }
                )
            }
        }
    }
}

@Composable
private fun PresetBrowserDialog(
    presets: List<HeraPreset>,
    currentIndex: Int,
    onSelectPreset: (Int) -> Unit,
    onDeleteUserPreset: (HeraPreset) -> Unit,
    onDismiss: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("ALL") }
    val categories = listOf("ALL", "USER", "STRINGS", "ORGAN", "BRASS", "BASS", "PIANO")

    val filteredIndices = remember(presets, searchQuery, selectedCategory) {
        presets.indices.filter { idx ->
            val p = presets[idx]
            val matchesSearch = searchQuery.isBlank() || p.name.contains(searchQuery, ignoreCase = true)
            if (!matchesSearch) return@filter false
            val lower = p.name.lowercase()
            when (selectedCategory) {
                "USER" -> p.isUserPreset
                "STRINGS" -> lower.contains("string")
                "ORGAN" -> lower.contains("organ")
                "BRASS" -> lower.contains("brass") || lower.contains("horn") || lower.contains("trumpet")
                "BASS" -> lower.contains("bass")
                "PIANO" -> lower.contains("piano") || lower.contains("clav") || lower.contains("harp")
                else -> true
            }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .width(460.dp)
                .heightIn(max = 380.dp)
                .background(Color(0xFF0E121B), RoundedCornerShape(10.dp))
                .border(1.5.dp, JunoAmberLed, RoundedCornerShape(10.dp))
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "TIMBRES / VOICING JUNO-60 (${presets.size})",
                    color = JunoAmberLed,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                SmallHeaderButton(text = "✕", onClick = onDismiss)
            }

            Spacer(Modifier.height(8.dp))

            // Category Filter Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                for (cat in categories) {
                    val isSel = selectedCategory == cat
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(if (isSel) JunoAmberLed else Color(0xFF171B26))
                            .border(
                                1.dp,
                                if (isSel) Color(0xFFFDE68A) else Color(0xFF2B3346),
                                RoundedCornerShape(4.dp)
                            )
                            .clickable { selectedCategory = cat }
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = cat,
                            color = if (isSel) Color.Black else Color(0xFFD1D5DB),
                            fontSize = 9.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                singleLine = true,
                placeholder = { Text("Buscar timbre...", fontSize = 11.sp) },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(filteredIndices) { idx ->
                    val p = presets[idx]
                    val isSel = idx == currentIndex
                    val bankNum = (idx / 7) + 1
                    val patchNum = (idx % 7) + 1
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isSel) Color(0xFF2B2112) else Color(0xFF151924))
                            .border(
                                1.dp,
                                if (isSel) JunoAmberLed else Color(0xFF252D3D),
                                RoundedCornerShape(6.dp)
                            )
                            .clickable { onSelectPreset(idx) }
                            .padding(horizontal = 10.dp, vertical = 7.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = if (p.isUserPreset) "U$patchNum" else "$bankNum-$patchNum",
                                color = JunoRed,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 11.sp
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = idx.toString().padStart(2, '0'),
                                color = Color(0xFF9CA3AF),
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = p.name,
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = if (p.isUserPreset) "USER" else "FACTORY",
                                color = if (p.isUserPreset) JunoCyanLearn else Color.Gray,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                            if (p.isUserPreset) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(Color(0xFF2B1216))
                                        .border(1.dp, JunoRed, RoundedCornerShape(4.dp))
                                        .clickable { onDeleteUserPreset(p) }
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "✕",
                                        color = Color(0xFFFCA5A5),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SavePresetDialog(
    initialName: String,
    onConfirmSave: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf(initialName) }
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .width(340.dp)
                .background(Color(0xFF0E121B), RoundedCornerShape(10.dp))
                .border(1.5.dp, JunoAmberLed, RoundedCornerShape(10.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "SALVAR VOICING / TIMBRE",
                color = JunoAmberLed,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold
            )
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                label = { Text("Nome do Timbre") },
                modifier = Modifier.fillMaxWidth()
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                SmallHeaderButton(text = "CANCELAR", onClick = onDismiss)
                Spacer(Modifier.width(8.dp))
                SmallHeaderButton(
                    text = "SALVAR",
                    bgColor = JunoAmberLed,
                    borderColor = JunoAmberLed,
                    textColor = Color.Black,
                    onClick = {
                        if (name.isNotBlank()) onConfirmSave(name.trim())
                    }
                )
            }
        }
    }
}

