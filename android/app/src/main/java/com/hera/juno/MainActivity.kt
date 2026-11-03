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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
            if (p.id in 0..36) {
                NativeSynthBridge.setParameter(p.id, v)
            }
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
                if (param.id in 0..36) {
                    NativeSynthBridge.setParameter(param.id, value)
                }
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
                            if (param.id in 0..36) {
                                NativeSynthBridge.setParameter(param.id, value)
                            }
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

    // Arpeggiator State (Full Arpeggiator section is toggled via the ARP button next to Presets)
    var arpEnabled by remember { mutableStateOf(false) }
    var arpMode by remember { mutableIntStateOf(0) } // 0=UP, 1=UP/DN, 2=DOWN
    var arpRange by remember { mutableIntStateOf(1) } // 1..3
    var arpRateDiv by remember { mutableIntStateOf(8) } // 4, 8, 16
    var arpBpm by remember { mutableFloatStateOf(120f) }
    var arpExpanded by remember { mutableStateOf(false) }

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

    // Bind MIDI Program Change & Preset Prev/Next Arrow triggers to applyPreset
    SideEffect {
        midiManager.onPresetStep = { delta ->
            applyPreset(currentPresetIndex + delta)
        }
        midiManager.onProgramChange = { prgNum ->
            if (allPresets.isNotEmpty()) {
                applyPreset(prgNum.coerceAtLeast(0) % allPresets.size)
            }
        }
    }

    // Force read uiRevision so Compose recomposes when MIDI Learn / Profile updates
    val rev = uiRevision
    val activeProfile = remember(rev) { midiManager.getActiveProfile() }
    val keysCh = activeProfile.sectionChannels[MidiSection.KEYS] ?: 0
    val mappedCount = activeProfile.paramToCC.size

    val mainVerticalScroll = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    val baseDensity = LocalDensity.current
    // Refine UI DPI scale (0.80x) so the native Android layout matches the crisp desktop/AI Studio preview density
    val previewMatchedDensity = remember(baseDensity) {
        Density(
            density = baseDensity.density * 0.80f,
            fontScale = baseDensity.fontScale * 0.96f
        )
    }

    CompositionLocalProvider(LocalDensity provides previewMatchedDensity) {
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

            BoxWithConstraints(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
                // With 0.80x density scale, compact phone landscape heights (~380..430 native dp) map to ~475..540 scaled dp
                val isCompactViewport = maxHeight <= 540.dp
                val firstScreenHeight = if (isCompactViewport) {
                    maxHeight.coerceAtLeast(320.dp)
                } else {
                    (405.dp + (maxHeight - 540.dp) * 0.14f).coerceIn(405.dp, 445.dp)
                }
                val keyboardSectionHeight = if (isCompactViewport) {
                    172.dp
                } else {
                    (maxHeight - firstScreenHeight - 48.dp).coerceIn(175.dp, 245.dp)
                }
                val responsiveSemitones = when {
                    maxWidth >= 1120.dp -> 48
                    maxWidth >= 820.dp -> 36
                    else -> 29
                }

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(mainVerticalScroll)
                ) {
                // FIRST SCREEN VIEWPORT: HEADER + MAIN SYNTHESIZER FADERS RACK + PRESET BAR
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(firstScreenHeight)
                ) {
                    // 1. TOP ROLAND HEADER BAR (Branding with VOICES next to JUNO-60 + Scope + Distinct MIDI & Master Controls)
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
                        isProfileExpanded = showProfileDialog,
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
                        onToggleProfileExpanded = { showProfileDialog = !showProfileDialog },
                        onPanic = {
                            holdSustain = false
                            onPanicAllNotesOff()
                        }
                    )

                    // 1A. INLINE EXPANDABLE MIDI PROFILE DRAWER (Expands downwards instead of opening a pop-up!)
                    if (showProfileDialog) {
                        MidiProfileInlineDrawer(
                            midiManager = midiManager,
                            uiRevision = rev,
                            onNotifyUiChanged = onNotifyUiChanged,
                            onCollapse = { showProfileDialog = false }
                        )
                    }

                    // 1B. Signature Roland Juno-60 5-Color Metallic Accent Stripe (Top Separator)
                    JunoRainbowSeparator()

                    // 2. MAIN HORIZONTAL SCROLLABLE SYNTHESIZER RACK (Ergonomically proportioned across both compact phones and large displays)
                    val rackScrollState = rememberScrollState()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .background(Color(0xFF11131A))
                            .horizontalScroll(rackScrollState)
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)
                    ) {
                        // SECTION 1: LFO (Rate + Vib Del faders with MAN TRIG button directly below them inside the section)
                        val manTrigActive = (paramState[SynthParam.LFOManualTrig] ?: 0f) >= 0.5f
                        SynthModuleCard(
                            title = "LFO",
                            footer = "MODULATOR",
                            accentColor = Color(0xFFEAB308)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterVertically),
                                modifier = Modifier.fillMaxHeight()
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                                    modifier = Modifier.fillMaxHeight(0.78f)
                                ) {
                                    JunoParamFader(
                                        param = SynthParam.LFORate,
                                        value = paramState[SynthParam.LFORate] ?: 0.6f,
                                        capColor = JunoOrange,
                                        midiManager = midiManager,
                                        uiRevision = rev,
                                        heightFraction = 1f,
                                        onValueChange = { onUpdateParam(SynthParam.LFORate, it) },
                                        onNotifyUiChanged = onNotifyUiChanged
                                    )
                                    JunoParamFader(
                                        param = SynthParam.LFODelay,
                                        value = paramState[SynthParam.LFODelay] ?: 0.0f,
                                        capColor = JunoOrange,
                                        midiManager = midiManager,
                                        uiRevision = rev,
                                        heightFraction = 1f,
                                        onValueChange = { onUpdateParam(SynthParam.LFODelay, it) },
                                        onNotifyUiChanged = onNotifyUiChanged
                                    )
                                }
                                JunoParamSwitchWithBadge(
                                    param = SynthParam.LFOManualTrig,
                                    active = manTrigActive,
                                    activeLabel = "MAN TRIG",
                                    inactiveLabel = "MAN TRIG",
                                    activeColor = JunoAmberLed,
                                    midiManager = midiManager,
                                    uiRevision = rev,
                                    compact = false,
                                    onToggle = {
                                        onUpdateParam(SynthParam.LFOManualTrig, if (manTrigActive) 0f else 1f)
                                    },
                                    onNotifyUiChanged = onNotifyUiChanged
                                )
                            }
                        }

                // SECTION 2: DCO (OSCILLATOR) - Left Selector Column (RANGE, LFO TRIG, PWM) + 6 Red Faders
                SynthModuleCard(
                    title = "DCO (OSCILLATOR)",
                    footer = "POLYBLEP ANALOG WAVEFORMS",
                    accentColor = JunoRed
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        // Compact 3-Switch Column (RANGE, LFO TRIG, PWM) centered vertically from the middle
                        Column(
                            verticalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterVertically),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .wrapContentHeight()
                                .background(Color(0xFF0A0D14), RoundedCornerShape(4.dp))
                                .border(1.dp, Color(0xFF1A2232), RoundedCornerShape(4.dp))
                                .padding(horizontal = 3.dp, vertical = 4.dp)
                        ) {
                            SelectorGroupBox(
                                param = SynthParam.DCORange,
                                title = "RANGE",
                                options = listOf("16'", "8'", "4'"),
                                selectedIndex = (paramState[SynthParam.DCORange] ?: 1f).roundToInt().coerceIn(0, 2),
                                midiManager = midiManager,
                                uiRevision = rev,
                                onSelect = { onUpdateParam(SynthParam.DCORange, it.toFloat()) },
                                onNotifyUiChanged = onNotifyUiChanged
                            )
                            SelectorGroupBox(
                                param = SynthParam.LFOTrigMode,
                                title = "LFO TRIG",
                                options = listOf("MAN", "AUTO"),
                                selectedIndex = (paramState[SynthParam.LFOTrigMode] ?: 1f).roundToInt().coerceIn(0, 1),
                                midiManager = midiManager,
                                uiRevision = rev,
                                onSelect = { onUpdateParam(SynthParam.LFOTrigMode, it.toFloat()) },
                                onNotifyUiChanged = onNotifyUiChanged
                            )
                            SelectorGroupBox(
                                param = SynthParam.DCOPWMMod,
                                title = "PWM",
                                options = listOf("MAN", "LFO", "ENV"),
                                selectedIndex = (paramState[SynthParam.DCOPWMMod] ?: 1f).roundToInt().coerceIn(0, 2),
                                midiManager = midiManager,
                                uiRevision = rev,
                                onSelect = { onUpdateParam(SynthParam.DCOPWMMod, it.toFloat()) },
                                onNotifyUiChanged = onNotifyUiChanged
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
                    accentColor = Color(0xFF06B6D4)
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
                    accentColor = Color(0xFF22D3EE)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
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
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        SelectorGroupBox(
                            param = SynthParam.VCAType,
                            title = "TYPE",
                            options = listOf("ENV", "GATE"),
                            selectedIndex = (paramState[SynthParam.VCAType] ?: 0f).roundToInt().coerceIn(0, 1),
                            midiManager = midiManager,
                            uiRevision = rev,
                            onSelect = { onUpdateParam(SynthParam.VCAType, it.toFloat()) },
                            onNotifyUiChanged = onNotifyUiChanged
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
                    accentColor = Color(0xFFFBBF24)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
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
                    else -> "OFF"
                }
                SynthModuleCard(
                    title = "CHORUS",
                    footer = chorusFooter,
                    accentColor = Color(0xFFF43F5E)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.fillMaxHeight()
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
                            compact = true,
                            onToggle = { onUpdateParam(SynthParam.DelayEnabled, if (delayOn) 0f else 1f) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
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
                    title = "REVERB",
                    titleBadge = "GLOBAL",
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
                            compact = true,
                            onToggle = { onUpdateParam(SynthParam.ReverbEnabled, if (reverbOn) 0f else 1f) },
                            onNotifyUiChanged = onNotifyUiChanged
                        )
                    }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.fillMaxHeight()
                    ) {
                        SelectorGroupBox(
                            param = SynthParam.ReverbType,
                            title = "MODE",
                            options = listOf("PLATE", "HALL"),
                            selectedIndex = reverbTypeIdx,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onSelect = { onUpdateParam(SynthParam.ReverbType, it.toFloat()) },
                            onNotifyUiChanged = onNotifyUiChanged
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

                    // 2B. Signature Roland Juno-60 5-Color Metallic Accent Stripe
                    JunoRainbowSeparator()

                    // 2C. FIRST PART OF PRESETS SECTION INCLUDED ON FIRST SCREEN (Slightly reduces synth rack height above so Preset Bar is always visible on main screen!)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF090B10))
                            .padding(horizontal = 6.dp, vertical = 3.dp)
                    ) {
                        VoicingPresetBar(
                            presetIndex = currentPresetIndex,
                            preset = currentPreset,
                            allPresets = allPresets,
                            userPresetCount = userPresets.size,
                            isTimbresExpanded = showPresetsDialog,
                            arpEnabled = arpEnabled,
                            isArpExpanded = arpExpanded,
                            showKeyboard = showKeyboard,
                            midiManager = midiManager,
                            uiRevision = rev,
                            onNotifyUiChanged = onNotifyUiChanged,
                            onPrevPreset = { applyPreset(currentPresetIndex - 1) },
                            onNextPreset = { applyPreset(currentPresetIndex + 1) },
                            onToggleTimbresExpanded = {
                                val next = !showPresetsDialog
                                showPresetsDialog = next
                                if (next && isCompactViewport && mainVerticalScroll.value < 80) {
                                    coroutineScope.launch {
                                        mainVerticalScroll.animateScrollTo(140)
                                    }
                                }
                            },
                            onToggleArpExpanded = {
                                val next = !arpExpanded
                                arpExpanded = next
                                if (next && isCompactViewport && mainVerticalScroll.value < 60) {
                                    coroutineScope.launch {
                                        mainVerticalScroll.animateScrollTo(95)
                                    }
                                }
                            },
                            onToggleKeyboard = {
                                val next = !showKeyboard
                                showKeyboard = next
                                if (next && isCompactViewport && mainVerticalScroll.value < 80) {
                                    coroutineScope.launch {
                                        mainVerticalScroll.animateScrollTo(180)
                                    }
                                }
                            },
                            onSaveUserPreset = { showSavePresetDialog = true },
                            onExportPreset = {
                                val safeName = currentPreset.name.replace(Regex("[^a-zA-Z0-9_-]"), "_")
                                exportPresetLauncher.launch("$safeName.xml")
                            },
                            onImportPreset = {
                                importPresetLauncher.launch(arrayOf("*/*"))
                            }
                        )
                    }
                // END OF FIRST SCREEN VIEWPORT (Header + Synth Fader Rack + Preset Bar fill 100% of first screen!)
                }

                // 3. BELOW-THE-FOLD SECTION (Expanded Timbres Browser + Full Expandable Arpeggiator + Piano Keyboard)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF090B10))
                        .border(1.dp, Color(0xFF1A202E))
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (showPresetsDialog) {
                        VoicingTimbresInlineBrowser(
                            presetIndex = currentPresetIndex,
                            allPresets = allPresets,
                            userPresetCount = userPresets.size,
                            onSelectPreset = { idx -> applyPreset(idx) },
                            onDeleteUserPreset = { presetToDelete ->
                                userPresets = PresetRepository.deleteUserPreset(context, presetToDelete.name)
                                val newAll = PresetRepository.FACTORY_PRESETS + userPresets
                                if (currentPresetIndex >= newAll.size) {
                                    currentPresetIndex = 0
                                }
                                Toast.makeText(context, "Timbre removido: ${presetToDelete.name}", Toast.LENGTH_SHORT).show()
                            }
                        )
                    }

                    // 3B. FULL ARPEGGIATOR SECTION (Encompassed entirely by the ARP button next to Presets)
                    if (arpExpanded) {
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
                            }
                        )
                    }

                // 3C. KEYBOARD CONTROLS + BENDER/MOD WHEELS + MULTI-TOUCH POLYPHONIC KEYBOARD
                if (showKeyboard) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(keyboardSectionHeight)
                            .background(Color(0xFF0A0C10), RoundedCornerShape(5.dp))
                            .border(1.dp, Color(0xFF1F2432), RoundedCornerShape(5.dp))
                            .padding(horizontal = 5.dp, vertical = 5.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Left Bender / Mod Wheel / Octave / Hold Panel
                        Column(
                            modifier = Modifier
                                .width(126.dp)
                                .fillMaxHeight()
                                .background(Color(0xFF11141C), RoundedCornerShape(5.dp))
                                .border(1.dp, Color(0xFF242A3A), RoundedCornerShape(5.dp))
                                .padding(5.dp),
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
                                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                                    modifier = Modifier
                                        .background(Color(0xFF080A0E), RoundedCornerShape(3.dp))
                                        .border(1.dp, Color(0xFF222838), RoundedCornerShape(3.dp))
                                        .padding(horizontal = 3.dp, vertical = 1.5.dp)
                                ) {
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(2.dp))
                                            .background(Color(0xFF181D2A))
                                            .clickable { baseOctave = (baseOctave - 1).coerceIn(1, 5) }
                                            .padding(horizontal = 5.dp, vertical = 1.dp)
                                    ) {
                                        Text("-", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                    Text(
                                        text = "C$baseOctave",
                                        color = JunoAmberLed,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontFamily = FontFamily.Monospace,
                                        modifier = Modifier.padding(horizontal = 2.dp)
                                    )
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(2.dp))
                                            .background(Color(0xFF181D2A))
                                            .clickable { baseOctave = (baseOctave + 1).coerceIn(1, 5) }
                                            .padding(horizontal = 5.dp, vertical = 1.dp)
                                    ) {
                                        Text("+", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                }

                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(3.dp))
                                        .background(if (holdSustain) JunoAmberLed else Color(0xFF161A25))
                                        .border(
                                            1.dp,
                                            if (holdSustain) Color(0xFFFDE68A) else Color(0xFF293042),
                                            RoundedCornerShape(3.dp)
                                        )
                                        .clickable {
                                            val next = !holdSustain
                                            holdSustain = next
                                            if (!next) onPanicAllNotesOff()
                                        }
                                        .padding(horizontal = 5.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "HOLD",
                                        color = if (holdSustain) Color.Black else Color(0xFF9CA3AF),
                                        fontSize = 8.sp,
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
                                    Text("PITCH BEND", color = Color(0xFF9CA3AF), fontSize = 7.5.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = if (kotlin.math.abs(pitchBendUi) < 0.02f) "CTR" else "${(pitchBendUi * 100).roundToInt()}%",
                                        color = JunoRed,
                                        fontSize = 7.5.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(Modifier.height(2.dp))
                                HorizontalTouchStrip(
                                    value = (pitchBendUi + 1f) * 0.5f,
                                    accentColor = JunoRed,
                                    springCenter = true,
                                    width = 112.dp,
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
                                    Text("MOD / LFO", color = Color(0xFF9CA3AF), fontSize = 7.5.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = "${(modWheelUi * 100).roundToInt()}%",
                                        color = JunoOrange,
                                        fontSize = 7.5.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(Modifier.height(2.dp))
                                HorizontalTouchStrip(
                                    value = modWheelUi,
                                    accentColor = JunoOrange,
                                    springCenter = false,
                                    width = 112.dp,
                                    onChange = { norm ->
                                        modWheelUi = norm.coerceIn(0f, 1f)
                                        NativeSynthBridge.setPitchBend(pitchBendUi, modWheelUi)
                                    },
                                    onRelease = {}
                                )
                            }
                        }

                        // Multi-Touch Polyphonic Piano Keyboard (Scales semitone range dynamically on wider screens)
                        val startMidiNote = baseOctave * 12 + 12 // C3 = 48
                        MultiTouchPolyphonicKeyboard(
                            startNote = startMidiNote,
                            numSemitones = responsiveSemitones,
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

    // MODAL 2: SAVE USER VOICING / PRESET
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
}

/**
 * Signature Roland Juno-60 5-Segment Rainbow Metallic Stripe
 * Used to separate the Header from the Synth Rack and the Synth Rack from the Keyboard/Voicing section.
 */
@Composable
private fun JunoRainbowSeparator() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(3.dp)
    ) {
        Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFDC2626)))
        Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFD97706)))
        Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFEAB308)))
        Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF06B6D4)))
        Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF2563EB)))
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
            .clip(RoundedCornerShape(6.dp))
            .background(Color(0xFF0E1016))
            .border(1.dp, Color(0xFF323846), RoundedCornerShape(6.dp))
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
                cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx())
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
 * Compact, Desktop-Grade Roland Header Bar:
 * - App Branding: Atari Cartridge Icon + HERA + JUNO-60 red badge + VOICES indicator placed directly next to JUNO-60
 *   (with the subtitle description stretched cleanly underneath)
 * - Real-time 60fps CRT Oscilloscope
 * - Visually Differentiated Control Deck:
 *   1. MIDI Routing & Profile Sub-Panel (MIDI LED + CANAIS T:CHxx + Divider + inline expandable PERFIL)
 *   2. MIDI LEARN Button with mapped count pill
 *   3. Master Volume Control (VOL/MUTE chip + Slider + Digital readout + floating rounded MIDI cartridge)
 *   4. TECLADO & PANIC buttons
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
    isProfileExpanded: Boolean,
    mappedCount: Int,
    isMidiLearn: Boolean,
    learningTargetKey: String?,
    onToggleMidiLearn: () -> Unit,
    onNotifyUiChanged: () -> Unit,
    onOpenChannelsModal: () -> Unit,
    onToggleProfileExpanded: () -> Unit,
    onPanic: () -> Unit
) {
    val headerScroll = rememberScrollState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.horizontalGradient(
                    listOf(Color(0xFF090A0F), Color(0xFF11141C), Color(0xFF090A0F))
                )
            )
            .horizontalScroll(headerScroll)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        // LEFT: App Branding (HERA + JUNO-60 + VOICES right next to JUNO-60, and stretched description below) + CRT Oscilloscope
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            AtariCartridgeBadgeIcon(modifier = Modifier.size(30.dp))

            Column(verticalArrangement = Arrangement.Center) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Text(
                        text = "HERA",
                        color = Color(0xFFF3F4F6),
                        fontSize = 14.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.4.sp
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color(0xFFDC2626))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = "JUNO-60",
                            color = Color.White,
                            fontSize = 7.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 0.7.sp
                        )
                    }

                    // 6-Voice Polyphony Indicator adapted right next to "JUNO-60"
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier
                            .background(Color(0xFF080A0E), RoundedCornerShape(3.dp))
                            .border(1.dp, Color(0xFF1E2330), RoundedCornerShape(3.dp))
                            .padding(horizontal = 5.dp, vertical = 1.5.dp)
                    ) {
                        Text(
                            text = "VOICES",
                            color = Color(0xFF9CA3AF),
                            fontSize = 6.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.6.sp
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            for (v in 0 until 6) {
                                val lit = v < activeVoiceCount
                                Box(
                                    modifier = Modifier
                                        .size(5.dp)
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
                }

                // Subtitle stretched slightly underneath so it aligns cleanly with HERA JUNO-60 + VOICES
                Text(
                    text = "POLYPHONIC SYNTHESIZER • 6 VOICES • STEREO BBD CHORUS",
                    color = Color(0xFF9CA3AF),
                    fontSize = 6.5.sp,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.65.sp
                )
            }

            // Real-time 60fps CRT Oscilloscope next to branding
            Box(
                modifier = Modifier
                    .width(86.dp)
                    .height(26.dp)
                    .background(Color(0xFF05100C), RoundedCornerShape(4.dp))
                    .border(1.dp, Color(0xFF1B4332), RoundedCornerShape(4.dp))
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
                            style = Stroke(width = 1.8f, cap = StrokeCap.Round)
                        )
                    }
                }
            }
        }

        Spacer(Modifier.width(8.dp))

        // RIGHT: Sleek Desktop Control Deck Container
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier
                .background(Color(0xFF07090D), RoundedCornerShape(5.dp))
                .border(1.dp, Color(0xFF1E2432), RoundedCornerShape(5.dp))
                .padding(horizontal = 6.dp, vertical = 2.5.dp)
        ) {
            // GROUP 1: MIDI Channels & Profile Selector Sub-Panel
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier
                    .background(Color(0xFF0C0F16), RoundedCornerShape(4.dp))
                    .border(1.dp, Color(0xFF212838), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                // MIDI Status Indicator
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(5.5.dp)
                            .clip(CircleShape)
                            .background(JunoGreenReady)
                    )
                    Text(
                        text = "MIDI",
                        color = Color(0xFF9CA3AF),
                        fontSize = 7.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }

                // CANAIS Button (Sleek Sky-Blue with Amber T:CH badge)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color(0xFF141B26))
                        .border(1.dp, Color(0xFF0284C7), RoundedCornerShape(3.dp))
                        .clickable { onOpenChannelsModal() }
                        .padding(horizontal = 5.dp, vertical = 1.5.dp)
                ) {
                    Text(
                        text = "CANAIS",
                        color = Color(0xFF7DD3FC),
                        fontSize = 8.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF090C12), RoundedCornerShape(2.dp))
                            .border(1.dp, Color(0xFF262E40), RoundedCornerShape(2.dp))
                            .padding(horizontal = 3.dp, vertical = 0.5.dp)
                    ) {
                        Text(
                            text = "T:${if (keysChannel == 0) "OMNI" else "CH$keysChannel"}",
                            color = JunoAmberLed,
                            fontSize = 7.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                    Text(
                        text = "▾",
                        color = Color(0xFF38BDF8),
                        fontSize = 7.5.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Vertical Divider inside MIDI Group
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(13.dp)
                        .background(Color(0xFF232A3A))
                )

                // PERFIL Selector (Expands downwards inline instead of opening a pop-up!)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    Text(
                        text = "PERFIL:",
                        color = JunoGreenReady,
                        fontSize = 7.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(3.dp))
                            .background(if (isProfileExpanded) Color(0xFF0F2922) else Color(0xFF111D1A))
                            .border(
                                1.dp,
                                if (isProfileExpanded) Color(0xFF34D399) else Color(0xFF059669),
                                RoundedCornerShape(3.dp)
                            )
                            .clickable { onToggleProfileExpanded() }
                            .padding(horizontal = 5.dp, vertical = 1.5.dp)
                    ) {
                        Text(
                            text = profileName,
                            color = Color(0xFF6EE7B7),
                            fontSize = 8.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 1
                        )
                        Text(
                            text = if (isProfileExpanded) "▴" else "▾",
                            color = JunoGreenReady,
                            fontSize = 7.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // GROUP 2: Clean Typographic MIDI LEARN Button with Mapped Counter Pill
            val learnLabel = when {
                !isMidiLearn -> "MIDI LEARN"
                learningTargetKey != null -> "AGUARDANDO CC"
                else -> "MIDI LEARN"
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (isMidiLearn) Color(0xFF0284C7) else Color(0xFF1C202B))
                    .border(
                        width = 1.dp,
                        color = if (isMidiLearn) Color(0xFF7DD3FC) else Color(0xFF32394A),
                        shape = RoundedCornerShape(4.dp)
                    )
                    .clickable { onToggleMidiLearn() }
                    .padding(horizontal = 6.dp, vertical = 2.5.dp)
            ) {
                Text(
                    text = learnLabel,
                    color = if (isMidiLearn) Color.White else Color(0xFFE5E7EB),
                    fontSize = 8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(if (isMidiLearn) Color(0xFF082F49) else Color(0xFF11151E))
                        .padding(horizontal = 4.dp, vertical = 0.5.dp)
                ) {
                    Text(
                        text = mappedCount.toString(),
                        color = if (isMidiLearn) Color(0xFF7DD3FC) else Color(0xFF9CA3AF),
                        fontSize = 7.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // GROUP 3: Master Volume (With Floating Zero-Layout-Shift Rounded MIDI Cartridge)
            val revIgnore = uiRevision
            val volMappedCC = remember(revIgnore) { midiManager.getMappedCC(SynthParam.MasterVolume.key) }
            val volMappedCh = remember(revIgnore) { midiManager.getMappedChannel(SynthParam.MasterVolume.key) }
            val isVolWaiting = isMidiLearn && midiManager.learningTargetKey == SynthParam.MasterVolume.key

            Box(contentAlignment = Alignment.TopCenter) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .background(
                            if (isVolWaiting) Color(0xFF0B253A) else Color(0xFF11151E),
                            RoundedCornerShape(4.dp)
                        )
                        .border(
                            width = if (isVolWaiting) 1.5.dp else 1.dp,
                            color = when {
                                isVolWaiting -> Color(0xFF38BDF8)
                                isMidiLearn -> Color(0xFF0369A1)
                                else -> Color(0xFF252C3D)
                            },
                            shape = RoundedCornerShape(4.dp)
                        )
                        .clickable(enabled = isMidiLearn) {
                            midiManager.learningTargetKey = SynthParam.MasterVolume.key
                            onNotifyUiChanged()
                        }
                        .padding(horizontal = 5.dp, vertical = 2.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(2.dp))
                            .background(if (isMasterMuted) Color(0xFF3B1219) else Color(0xFF1B202E))
                            .clickable {
                                if (isMidiLearn) {
                                    midiManager.learningTargetKey = SynthParam.MasterVolume.key
                                    onNotifyUiChanged()
                                } else {
                                    onToggleMasterMute()
                                }
                            }
                            .padding(horizontal = 3.5.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = if (isMasterMuted || masterVolume <= 0.001f) "MUTE" else "VOL",
                            color = if (isMasterMuted) Color(0xFFFCA5A5) else Color(0xFF9CA3AF),
                            fontSize = 7.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                    HorizontalTouchStrip(
                        value = if (isMasterMuted) 0f else masterVolume,
                        accentColor = JunoAmberLed,
                        springCenter = false,
                        width = 48.dp,
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
                        fontSize = 8.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }

                // Floating Rounded MIDI Cartridge Overlay (Zero layout shift!)
                MidiCcBalloonBadge(
                    mappedCC = volMappedCC,
                    mappedChannel = volMappedCh,
                    isLearnMode = isMidiLearn,
                    isWaitingCC = isVolWaiting,
                    onSelectForLearn = {
                        midiManager.learningTargetKey = SynthParam.MasterVolume.key
                        onNotifyUiChanged()
                    },
                    onClearMapping = {
                        midiManager.clearMappingForParam(SynthParam.MasterVolume.key)
                        onNotifyUiChanged()
                    },
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .offset(y = (-5).dp)
                        .zIndex(30f)
                )
            }

            // GROUP 4: Panic Button (Keyboard toggle moved next to ARP in the Preset bar)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFF221014))
                        .border(1.dp, Color(0xFF881B1B), RoundedCornerShape(4.dp))
                        .clickable { onPanic() }
                        .padding(horizontal = 5.5.dp, vertical = 2.5.dp)
                ) {
                    Text(
                        text = "PANIC",
                        color = Color(0xFFFCA5A5),
                        fontSize = 8.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
    }
}

/**
 * Inline Downward-Expanding MIDI Profile Drawer (No modal pop-up!):
 * Expands directly below the TopHeaderBar when "PERFIL" ("Launchkey MK4") is clicked.
 */
@Composable
private fun MidiProfileInlineDrawer(
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onNotifyUiChanged: () -> Unit,
    onCollapse: () -> Unit
) {
    val revIgnore = uiRevision
    val activeId = remember(revIgnore) { midiManager.activeProfileId }
    val scroll = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0A1114))
            .border(1.dp, Color(0xFF059669))
            .horizontalScroll(scroll)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Text(
                text = "SELECIONAR PERFIL MIDI:",
                color = JunoGreenReady,
                fontSize = 7.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold
            )

            for (prof in midiManager.profiles) {
                val isSelected = prof.id == activeId
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (isSelected) Color(0xFF0F2922) else Color(0xFF131822))
                        .border(
                            1.dp,
                            if (isSelected) JunoGreenReady else Color(0xFF263042),
                            RoundedCornerShape(4.dp)
                        )
                        .clickable {
                            midiManager.selectProfile(prof.id)
                            onNotifyUiChanged()
                            onCollapse()
                        }
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = prof.name,
                        color = if (isSelected) Color(0xFF6EE7B7) else Color(0xFFE5E7EB),
                        fontSize = 8.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text(
                        text = "(${prof.paramToCC.size}CC)",
                        color = if (isSelected) JunoGreenReady else Color(0xFF9CA3AF),
                        fontSize = 7.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        Spacer(Modifier.width(10.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(3.dp))
                    .background(Color(0xFF231115))
                    .border(1.dp, JunoRed, RoundedCornerShape(3.dp))
                    .clickable {
                        midiManager.resetActiveProfileToFactory()
                        onNotifyUiChanged()
                    }
                    .padding(horizontal = 6.dp, vertical = 2.5.dp)
            ) {
                Text(
                    text = "RESTAURAR PADRÃO",
                    color = Color(0xFFFCA5A5),
                    fontSize = 7.5.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(3.dp))
                    .background(Color(0xFF161B26))
                    .border(1.dp, Color(0xFF2E3648), RoundedCornerShape(3.dp))
                    .clickable { onCollapse() }
                    .padding(horizontal = 6.dp, vertical = 2.5.dp)
            ) {
                Text(
                    text = "FECHAR ▲",
                    color = Color(0xFFD1D5DB),
                    fontSize = 7.5.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

/**
 * ULTRA-SLIM VOICING / PATCH BAR & INLINE EXPANDABLE TIMBRES BROWSER:
 * - Drastically reduced thickness
 * - Removed "VOICING" word and "FACTORY" label; shows only the preset name next to BANK and PATCH
 *   (or "Factory #xx" if the voice has no name)
 * - Buttons: "◀", "▶", "SALVAR", "↓ DOWNLOAD", "↑ UPLOAD", and "TIMBRES"
 * - Pressing "TIMBRES" expands the window downwards inline within the Timbres section (no pop-up!),
 *   showing all banks and patches in order.
 */
@Composable
private fun VoicingPresetBar(
    presetIndex: Int,
    preset: HeraPreset,
    allPresets: List<HeraPreset>,
    userPresetCount: Int,
    isTimbresExpanded: Boolean,
    arpEnabled: Boolean,
    isArpExpanded: Boolean,
    showKeyboard: Boolean,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onNotifyUiChanged: () -> Unit,
    onPrevPreset: () -> Unit,
    onNextPreset: () -> Unit,
    onToggleTimbresExpanded: () -> Unit,
    onToggleArpExpanded: () -> Unit,
    onToggleKeyboard: () -> Unit,
    onSaveUserPreset: () -> Unit,
    onExportPreset: () -> Unit,
    onImportPreset: () -> Unit
) {
    val revIgnore = uiRevision
    val bankNumber = (presetIndex / 7) + 1
    val patchNumber = (presetIndex % 7) + 1
    val barScroll = rememberScrollState()
    val isLearnMode = midiManager.isMidiLearnActive

    val prevMappedCC = remember(revIgnore) { midiManager.getMappedCC(SynthParam.PresetPrev.key) }
    val prevMappedCh = remember(revIgnore) { midiManager.getMappedChannel(SynthParam.PresetPrev.key) }
    val prevWaiting = isLearnMode && midiManager.learningTargetKey == SynthParam.PresetPrev.key

    val nextMappedCC = remember(revIgnore) { midiManager.getMappedCC(SynthParam.PresetNext.key) }
    val nextMappedCh = remember(revIgnore) { midiManager.getMappedChannel(SynthParam.PresetNext.key) }
    val nextWaiting = isLearnMode && midiManager.learningTargetKey == SynthParam.PresetNext.key

    val displayVoiceName = remember(preset, presetIndex) {
        val trimmed = preset.name.trim()
        if (trimmed.isEmpty() || trimmed.equals("Unnamed", ignoreCase = true) || trimmed.equals("Sem Nome", ignoreCase = true)) {
            "Factory #${(presetIndex + 1).toString().padStart(2, '0')}"
        } else {
            trimmed
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF10131B), RoundedCornerShape(4.dp))
            .border(1.dp, Color(0xFF23293A), RoundedCornerShape(4.dp))
            .horizontalScroll(barScroll)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        // LEFT: BANK + PATCH (with centered Red LED digits) + Voice Name
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier
                .background(Color(0xFF07090D), RoundedCornerShape(3.5.dp))
                .border(1.dp, Color(0xFF1D2230), RoundedCornerShape(3.5.dp))
                .clickable { onToggleTimbresExpanded() }
                .padding(horizontal = 7.dp, vertical = 2.5.dp)
        ) {
            // BANK inline LED (Centered red number without font-padding vertical offset bug)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.5.dp)
            ) {
                Text(
                    text = "BANK",
                    color = Color(0xFF6B7280),
                    fontSize = 7.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(width = 18.dp, height = 18.dp)
                        .background(Color(0xFF160205), RoundedCornerShape(2.5.dp))
                        .border(1.dp, Color(0xFF450A0A), RoundedCornerShape(2.5.dp))
                ) {
                    Text(
                        text = if (preset.isUserPreset) "U" else bankNumber.toString(),
                        color = Color(0xFFEF4444),
                        fontSize = 10.sp,
                        lineHeight = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                        style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
                    )
                }
            }

            // PATCH inline LED (Centered red number without font-padding vertical offset bug)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.5.dp)
            ) {
                Text(
                    text = "PATCH",
                    color = Color(0xFF6B7280),
                    fontSize = 7.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(width = 18.dp, height = 18.dp)
                        .background(Color(0xFF160205), RoundedCornerShape(2.5.dp))
                        .border(1.dp, Color(0xFF450A0A), RoundedCornerShape(2.5.dp))
                ) {
                    Text(
                        text = patchNumber.toString(),
                        color = Color(0xFFEF4444),
                        fontSize = 10.sp,
                        lineHeight = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                        style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
                    )
                }
            }

            // Thin Divider
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(14.dp)
                    .background(Color(0xFF202636))
            )

            // Voice Name
            Text(
                text = displayVoiceName,
                color = JunoAmberLed,
                fontSize = 9.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(min = 115.dp, max = 190.dp)
            )
        }

        Spacer(Modifier.width(12.dp))

        // RIGHT: Wider, More Spaced Navigation Arrows (Responding to MIDI Program Change) & Preset Action Options
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Prev Timbre Arrow (Wider & comfortable + MIDI Program Change mapping support)
            Box(contentAlignment = Alignment.Center) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .width(34.dp)
                        .height(22.dp)
                        .clip(RoundedCornerShape(3.5.dp))
                        .background(if (prevWaiting) Color(0xFF0A2236) else Color(0xFF181C28))
                        .border(
                            width = if (prevWaiting) 1.5.dp else 1.dp,
                            color = when {
                                prevWaiting -> Color(0xFF38BDF8)
                                isLearnMode -> Color(0xFF0369A1)
                                else -> Color(0xFF2D3548)
                            },
                            shape = RoundedCornerShape(3.5.dp)
                        )
                        .clickable {
                            if (isLearnMode) {
                                midiManager.learningTargetKey = SynthParam.PresetPrev.key
                                onNotifyUiChanged()
                            } else {
                                onPrevPreset()
                            }
                        }
                ) {
                    Text(
                        text = "◀",
                        color = Color.White,
                        fontSize = 9.sp,
                        lineHeight = 9.sp,
                        fontWeight = FontWeight.ExtraBold,
                        style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
                    )
                }

                MidiCcBalloonBadge(
                    mappedCC = prevMappedCC,
                    mappedChannel = prevMappedCh,
                    isLearnMode = isLearnMode,
                    isWaitingCC = prevWaiting,
                    preferProgramChangeLabel = true,
                    onSelectForLearn = {
                        midiManager.learningTargetKey = SynthParam.PresetPrev.key
                        onNotifyUiChanged()
                    },
                    onClearMapping = {
                        midiManager.clearMappingForParam(SynthParam.PresetPrev.key)
                        onNotifyUiChanged()
                    },
                    modifier = Modifier
                        .align(Alignment.Center)
                        .zIndex(30f)
                )
            }

            // Next Timbre Arrow (Wider & comfortable + MIDI Program Change mapping support)
            Box(contentAlignment = Alignment.Center) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .width(34.dp)
                        .height(22.dp)
                        .clip(RoundedCornerShape(3.5.dp))
                        .background(if (nextWaiting) Color(0xFF0A2236) else Color(0xFF181C28))
                        .border(
                            width = if (nextWaiting) 1.5.dp else 1.dp,
                            color = when {
                                nextWaiting -> Color(0xFF38BDF8)
                                isLearnMode -> Color(0xFF0369A1)
                                else -> Color(0xFF2D3548)
                            },
                            shape = RoundedCornerShape(3.5.dp)
                        )
                        .clickable {
                            if (isLearnMode) {
                                midiManager.learningTargetKey = SynthParam.PresetNext.key
                                onNotifyUiChanged()
                            } else {
                                onNextPreset()
                            }
                        }
                ) {
                    Text(
                        text = "▶",
                        color = Color.White,
                        fontSize = 9.sp,
                        lineHeight = 9.sp,
                        fontWeight = FontWeight.ExtraBold,
                        style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
                    )
                }

                MidiCcBalloonBadge(
                    mappedCC = nextMappedCC,
                    mappedChannel = nextMappedCh,
                    isLearnMode = isLearnMode,
                    isWaitingCC = nextWaiting,
                    preferProgramChangeLabel = true,
                    onSelectForLearn = {
                        midiManager.learningTargetKey = SynthParam.PresetNext.key
                        onNotifyUiChanged()
                    },
                    onClearMapping = {
                        midiManager.clearMappingForParam(SynthParam.PresetNext.key)
                        onNotifyUiChanged()
                    },
                    modifier = Modifier
                        .align(Alignment.Center)
                        .zIndex(30f)
                )
            }

            // SALVAR
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .height(22.dp)
                    .clip(RoundedCornerShape(3.5.dp))
                    .background(Color(0xFF21190D))
                    .border(1.dp, JunoAmberLed, RoundedCornerShape(3.5.dp))
                    .clickable { onSaveUserPreset() }
                    .padding(horizontal = 9.dp)
            ) {
                Text(
                    text = "SALVAR",
                    color = JunoAmberLed,
                    fontSize = 7.8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // ↓ DOWNLOAD
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .height(22.dp)
                    .clip(RoundedCornerShape(3.5.dp))
                    .background(Color(0xFF0D1E18))
                    .border(1.dp, JunoGreenReady, RoundedCornerShape(3.5.dp))
                    .clickable { onExportPreset() }
                    .padding(horizontal = 9.dp)
            ) {
                Text(
                    text = "↓ DOWNLOAD",
                    color = Color(0xFF6EE7B7),
                    fontSize = 7.8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // ↑ UPLOAD
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .height(22.dp)
                    .clip(RoundedCornerShape(3.5.dp))
                    .background(Color(0xFF0D1B29))
                    .border(1.dp, JunoCyanLearn, RoundedCornerShape(3.5.dp))
                    .clickable { onImportPreset() }
                    .padding(horizontal = 9.dp)
            ) {
                Text(
                    text = "↑ UPLOAD",
                    color = Color(0xFF7DD3FC),
                    fontSize = 7.8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
            }

            // TIMBRES Inline Expand Button
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .height(22.dp)
                    .clip(RoundedCornerShape(3.5.dp))
                    .background(if (isTimbresExpanded) Color(0xFF33240D) else Color(0xFF241B0D))
                    .border(
                        1.dp,
                        if (isTimbresExpanded) Color(0xFFFDE68A) else Color(0xFFF59E0B),
                        RoundedCornerShape(3.5.dp)
                    )
                    .clickable { onToggleTimbresExpanded() }
                    .padding(horizontal = 9.dp)
            ) {
                Text(
                    text = "TIMBRES (${allPresets.size})",
                    color = Color(0xFFFBBF24),
                    fontSize = 7.8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
                if (userPresetCount > 0) {
                    Text(
                        text = "+$userPresetCount",
                        color = JunoCyanLearn,
                        fontSize = 7.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
                Text(
                    text = if (isTimbresExpanded) "▴" else "▾",
                    color = Color(0xFFFBBF24),
                    fontSize = 7.8.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // ARP Expand/Collapse Button (Placed next to Presets, encompassing the entire Arpeggiator section)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .height(22.dp)
                    .clip(RoundedCornerShape(3.5.dp))
                    .background(
                        when {
                            arpEnabled -> Color(0xFF33240D)
                            isArpExpanded -> Color(0xFF241B0D)
                            else -> Color(0xFF181C28)
                        }
                    )
                    .border(
                        1.dp,
                        when {
                            arpEnabled -> JunoAmberLed
                            isArpExpanded -> Color(0xFFF59E0B)
                            else -> Color(0xFF2D3548)
                        },
                        RoundedCornerShape(3.5.dp)
                    )
                    .clickable { onToggleArpExpanded() }
                    .padding(horizontal = 9.dp)
            ) {
                if (arpEnabled) {
                    Box(
                        modifier = Modifier
                            .size(5.5.dp)
                            .clip(CircleShape)
                            .background(JunoAmberLed)
                    )
                }
                Text(
                    text = "ARP",
                    color = if (arpEnabled || isArpExpanded) Color(0xFFFBBF24) else Color(0xFFD1D5DB),
                    fontSize = 7.8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = if (isArpExpanded) "▴" else "▾",
                    color = if (arpEnabled || isArpExpanded) Color(0xFFFBBF24) else Color(0xFF9CA3AF),
                    fontSize = 7.8.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Show/Hide Keyboard Button (Placed right next to ARP)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .height(22.dp)
                    .clip(RoundedCornerShape(3.5.dp))
                    .background(if (showKeyboard) Color(0xFF261A0B) else Color(0xFF181C28))
                    .border(
                        1.dp,
                        if (showKeyboard) JunoOrange else Color(0xFF2D3548),
                        RoundedCornerShape(3.5.dp)
                    )
                    .clickable { onToggleKeyboard() }
                    .padding(horizontal = 9.dp)
            ) {
                Text(
                    text = "TECLADO",
                    color = if (showKeyboard) JunoAmberLed else Color(0xFFD1D5DB),
                    fontSize = 7.8.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = if (showKeyboard) "▴" else "▾",
                    color = if (showKeyboard) JunoAmberLed else Color(0xFF9CA3AF),
                    fontSize = 7.8.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun VoicingTimbresInlineBrowser(
    presetIndex: Int,
    allPresets: List<HeraPreset>,
    userPresetCount: Int,
    onSelectPreset: (Int) -> Unit,
    onDeleteUserPreset: (HeraPreset) -> Unit
) {
    var selectedBankFilter by remember { mutableIntStateOf(0) } // 0 = TODOS EM ORDEM, 1..8 = BANK 1..8, 99 = USER
    val bankTabsScroll = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0A0D14), RoundedCornerShape(4.dp))
            .border(1.dp, Color(0xFF242B3D), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 5.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Top Bank Selector Bar (All Banks in Order: TODOS, BANK 1 .. BANK 8, USER)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(bankTabsScroll),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            val totalFactoryBanks = ((PresetRepository.FACTORY_PRESETS.size + 6) / 7).coerceAtLeast(1)
            val bankOptions = buildList {
                add(0 to "TODOS (${allPresets.size})")
                for (b in 1..totalFactoryBanks) {
                    add(b to "BANK $b")
                }
                if (userPresetCount > 0) {
                    add(99 to "USER ($userPresetCount)")
                }
            }

            for ((bankId, label) in bankOptions) {
                val isSel = selectedBankFilter == bankId
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(if (isSel) JunoAmberLed else Color(0xFF151924))
                        .border(
                            1.dp,
                            if (isSel) Color(0xFFFDE68A) else Color(0xFF262E40),
                            RoundedCornerShape(3.dp)
                        )
                        .clickable { selectedBankFilter = bankId }
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = label,
                        color = if (isSel) Color.Black else Color(0xFFD1D5DB),
                        fontSize = 7.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }

        // Ordered Grid/List of Banks and Patches (4 columns per row for clean desktop browser look)
        val filteredIndices = remember(allPresets, selectedBankFilter) {
            allPresets.indices.filter { idx ->
                val p = allPresets[idx]
                val bNum = (idx / 7) + 1
                when (selectedBankFilter) {
                    0 -> true
                    99 -> p.isUserPreset
                    else -> !p.isUserPreset && bNum == selectedBankFilter
                }
            }
        }

        val rows = filteredIndices.chunked(4)
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            for (rowIndices in rows) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    for (idx in rowIndices) {
                        val p = allPresets[idx]
                        val isCurrent = idx == presetIndex
                        val bNum = (idx / 7) + 1
                        val pNum = (idx % 7) + 1
                        val patchCode = if (p.isUserPreset) "U-$pNum" else "$bNum-$pNum"
                        val itemName = p.name.trim().ifEmpty {
                            "Factory #${(idx + 1).toString().padStart(2, '0')}"
                        }

                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(3.dp))
                                .background(if (isCurrent) Color(0xFF2B2112) else Color(0xFF131722))
                                .border(
                                    1.dp,
                                    if (isCurrent) JunoAmberLed else Color(0xFF22293A),
                                    RoundedCornerShape(3.dp)
                                )
                                .clickable { onSelectPreset(idx) }
                                .padding(horizontal = 5.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .background(Color(0xFF180407), RoundedCornerShape(2.dp))
                                        .border(0.8.dp, Color(0xFF450A0A), RoundedCornerShape(2.dp))
                                        .padding(horizontal = 3.5.dp, vertical = 1.5.dp)
                                ) {
                                    Text(
                                        text = patchCode,
                                        color = Color(0xFFEF4444),
                                        fontSize = 7.sp,
                                        lineHeight = 7.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Black,
                                        style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
                                    )
                                }
                                Text(
                                    text = itemName,
                                    color = if (isCurrent) JunoAmberLed else Color(0xFFE5E7EB),
                                    fontSize = 8.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = if (isCurrent) FontWeight.ExtraBold else FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            if (p.isUserPreset) {
                                Box(
                                    modifier = Modifier
                                        .padding(start = 3.dp)
                                        .clip(RoundedCornerShape(2.dp))
                                        .background(Color(0xFF2B1216))
                                        .border(0.8.dp, JunoRed, RoundedCornerShape(2.dp))
                                        .clickable { onDeleteUserPreset(p) }
                                        .padding(horizontal = 3.5.dp, vertical = 0.5.dp)
                                ) {
                                    Text(
                                        text = "✕",
                                        color = Color(0xFFFCA5A5),
                                        fontSize = 7.sp,
                                        fontWeight = FontWeight.Black
                                    )
                                }
                            }
                        }
                    }
                    val remaining = 4 - rowIndices.size
                    for (emptyIdx in 0 until remaining) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/**
 * Full Arpeggiator Panel (Toggled as a complete unit via the `ARP` button next to Presets):
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
    onToggleHold: () -> Unit
) {
    val modeNames = listOf("UP", "U/D", "DOWN")
    val rateLabels = listOf("1/4" to 4, "1/8" to 8, "1/16" to 16)
    val arpScroll = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0C0E14), RoundedCornerShape(5.dp))
            .border(1.dp, Color(0xFF202534), RoundedCornerShape(5.dp))
            .horizontalScroll(arpScroll)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Main ARP ON/OFF Button
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .clip(RoundedCornerShape(3.dp))
                .background(if (arpEnabled) Color(0xFFFBBF24) else Color(0xFF161A24))
                .border(
                    1.dp,
                    if (arpEnabled) Color(0xFFFDE68A) else Color(0xFF2D3446),
                    RoundedCornerShape(3.dp)
                )
                .clickable { onToggleArp() }
                .padding(horizontal = 8.dp, vertical = 2.5.dp)
        ) {
            Text(
                text = if (arpEnabled) "ARP ON" else "ARP OFF",
                color = if (arpEnabled) Color.Black else Color(0xFF9CA3AF),
                fontSize = 8.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Black
            )
        }

        // Quick Status Badges
        Box(
            modifier = Modifier
                .background(Color(0xFF131720), RoundedCornerShape(3.dp))
                .border(1.dp, Color(0xFF22293A), RoundedCornerShape(3.dp))
                .padding(horizontal = 5.dp, vertical = 2.dp)
        ) {
            Text(
                text = modeNames.getOrElse(arpMode) { "UP" },
                color = Color(0xFFD1D5DB),
                fontSize = 7.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
        }

        Box(
            modifier = Modifier
                .background(Color(0xFF131720), RoundedCornerShape(3.dp))
                .border(1.dp, Color(0xFF22293A), RoundedCornerShape(3.dp))
                .padding(horizontal = 5.dp, vertical = 2.dp)
        ) {
            Text(
                text = "$arpRange ${if (arpRange == 1) "OCT" else "OCTS"}",
                color = Color(0xFFD1D5DB),
                fontSize = 7.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
        }

        Box(
            modifier = Modifier
                .background(Color(0xFF131720), RoundedCornerShape(3.dp))
                .border(1.dp, Color(0xFF22293A), RoundedCornerShape(3.dp))
                .padding(horizontal = 5.dp, vertical = 2.dp)
        ) {
            Text(
                text = "${arpBpm.roundToInt()} BPM",
                color = JunoAmberLed,
                fontSize = 7.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold
            )
        }

        // Inline Mode Selector
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            modifier = Modifier.padding(start = 2.dp)
        ) {
            Text(
                text = "MODO:",
                color = Color(0xFF6B7280),
                fontSize = 7.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
            for (i in modeNames.indices) {
                val sel = arpMode == i
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(if (sel) JunoAmberLed else Color(0xFF151924))
                        .border(
                            1.dp,
                            if (sel) Color(0xFFFDE68A) else Color(0xFF272E40),
                            RoundedCornerShape(3.dp)
                        )
                        .clickable { onSelectArpMode(i) }
                        .padding(horizontal = 5.5.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = modeNames[i],
                        color = if (sel) Color.Black else Color(0xFF9CA3AF),
                        fontSize = 7.sp,
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
            modifier = Modifier.padding(start = 2.dp)
        ) {
            Text(
                text = "OITAVAS:",
                color = Color(0xFF6B7280),
                fontSize = 7.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
            for (r in 1..3) {
                val sel = arpRange == r
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(if (sel) JunoAmberLed else Color(0xFF151924))
                        .border(
                            1.dp,
                            if (sel) Color(0xFFFDE68A) else Color(0xFF272E40),
                            RoundedCornerShape(3.dp)
                        )
                        .clickable { onSelectArpRange(r) }
                        .padding(horizontal = 5.5.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "${r}x",
                        color = if (sel) Color.Black else Color(0xFF9CA3AF),
                        fontSize = 7.sp,
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
            modifier = Modifier.padding(start = 2.dp)
        ) {
            Text(
                text = "DIV:",
                color = Color(0xFF6B7280),
                fontSize = 7.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
            for ((label, divVal) in rateLabels) {
                val sel = arpRateDiv == divVal
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(if (sel) Color(0xFF38BDF8) else Color(0xFF151924))
                        .border(
                            1.dp,
                            if (sel) Color(0xFFBAE6FD) else Color(0xFF272E40),
                            RoundedCornerShape(3.dp)
                        )
                        .clickable { onSelectArpRateDiv(divVal) }
                        .padding(horizontal = 5.5.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = label,
                        color = if (sel) Color.Black else Color(0xFF9CA3AF),
                        fontSize = 7.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }

        // HOLD Toggle
        Box(
            modifier = Modifier
                .padding(start = 2.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(if (holdSustain) JunoAmberLed else Color(0xFF151924))
                .border(
                    1.dp,
                    if (holdSustain) Color(0xFFFDE68A) else Color(0xFF272E40),
                    RoundedCornerShape(3.dp)
                )
                .clickable { onToggleHold() }
                .padding(horizontal = 6.dp, vertical = 2.dp)
        ) {
            Text(
                text = if (holdSustain) "HOLD ON" else "HOLD OFF",
                color = if (holdSustain) Color.Black else Color(0xFF9CA3AF),
                fontSize = 7.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold
            )
        }

        // BPM Horizontal Slider
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(start = 2.dp)
        ) {
            Text(
                text = "BPM:",
                color = Color(0xFF6B7280),
                fontSize = 7.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
            HorizontalTouchStrip(
                value = ((arpBpm - 40f) / 200f).coerceIn(0f, 1f),
                accentColor = JunoAmberLed,
                springCenter = false,
                width = 72.dp,
                onChange = { norm -> onArpBpmChange(40f + norm * 200f) },
                onRelease = {}
            )
        }
    }
}

/**
 * Authentic Juno-60 Section Rack Card (`LFO`, `DCO`, `HPF`, `VCF`, `VCA`, `ENV`, `CHORUS`, `ECHO DELAY`, `REVERB`):
 * - Thick colored top line (`3.dp`, `accentColor`)
 * - Below that: a lighter/tinted colored contrast bar (`accentColor.copy(alpha = 0.16f)`) defining the title zone,
 *   with the section title ALWAYS centered and keeping `accentColor`
 * - Extra vertical room for faders
 * - Very small, thin, centered footer (or `MAN TRIG` at bottom of `LFO`)
 * - Bottom colored bar (`2.5.dp`, `accentColor`) below the footer text at the bottom of the cartridge
 */
@Composable
private fun SynthModuleCard(
    title: String,
    footer: String?,
    accentColor: Color,
    titleBadge: String? = null,
    headerRight: (@Composable () -> Unit)? = null,
    bottomBar: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(IntrinsicSize.Max)
            .fillMaxHeight()
            .clip(RoundedCornerShape(5.dp))
            .background(Color(0xFF0B0D13))
            .border(1.dp, Color(0xFF1F2533), RoundedCornerShape(5.dp))
    ) {
        // 1. Thin Colored Top Line spanning 100% of the section width
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(accentColor)
        )

        // 2. Ultra-Slim Full-Width Tinted Header Bar right at the top with strictly centered title
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(13.dp)
                .background(accentColor.copy(alpha = 0.18f))
                .padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(
                modifier = Modifier.align(Alignment.Center),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(
                    text = title,
                    color = accentColor,
                    fontSize = 6.8.sp,
                    lineHeight = 7.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.5.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1
                )
                if (titleBadge != null) {
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF2E1065), RoundedCornerShape(2.dp))
                            .border(0.8.dp, Color(0xFF6D28D9), RoundedCornerShape(2.dp))
                            .padding(horizontal = 2.dp, vertical = 0.dp)
                    ) {
                        Text(
                            text = titleBadge,
                            color = Color(0xFFDDD6FE),
                            fontSize = 5.5.sp,
                            lineHeight = 6.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
            }

            if (headerRight != null) {
                Box(modifier = Modifier.align(Alignment.CenterEnd)) {
                    headerRight()
                }
            }
        }

        // Crisp hairline divider under the full-width title bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(0.8.dp)
                .background(accentColor.copy(alpha = 0.35f))
        )

        // 3. Main Controls Area (Double horizontal padding at start/end compared to inter-fader spacing + comfortable vertical breathing room)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 13.dp, vertical = 9.dp),
            contentAlignment = Alignment.Center
        ) {
            content()
        }

        // 4. Ultra-Slim Full-Width Centered Footer Bar (or MAN TRIG) + Bottom Colored Bar
        if (bottomBar != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(0.8.dp)
                    .background(Color(0xFF181D29))
            )
            bottomBar()
        } else if (footer != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(0.8.dp)
                    .background(Color(0xFF181D29))
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(12.dp)
                    .background(Color(0xFF080A0F))
                    .padding(horizontal = 3.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = footer,
                    color = Color(0xFF9CA3AF),
                    fontSize = 5.5.sp,
                    lineHeight = 6.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.4.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1
                )
            }
        }

        // 5. Colored Accent Bar repeated across 100% width at the very bottom of the section
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(accentColor)
        )
    }
}

/**
 * Sleek Desktop-Grade Vertical Juno-60 Fader (`44.dp` wide):
 * - Fixed geometry: turning MIDI Learn ON/OFF or selecting a fader NEVER alters fader height or position!
 * - Luminous cyan halo/aura (`Color(0xFF38BDF8)`) when selected for MIDI Learn
 * - Floating truly-rounded blue cartridge (`MidiCcBalloonBadge`) overlaid at the top edge ONLY when mapped or selected
 * - Authentic `100`, `50`, `0` scale markings on the left and 3 tick lines on the right
 * - Smaller digital readout box at bottom to give the fader track even more vertical travel
 */
@Composable
private fun JunoParamFader(
    param: SynthParam,
    value: Float,
    capColor: Color,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    heightFraction: Float = 0.86f,
    onValueChange: (Float) -> Unit,
    onNotifyUiChanged: () -> Unit
) {
    val revIgnore = uiRevision
    val mappedCC = remember(revIgnore, param) { midiManager.getMappedCC(param.key) }
    val mappedCh = remember(revIgnore, param) { midiManager.getMappedChannel(param.key) }
    val isLearnMode = midiManager.isMidiLearnActive
    val isSelectedTarget = isLearnMode && midiManager.learningTargetKey == param.key

    Box(
        contentAlignment = Alignment.TopCenter,
        modifier = Modifier
            .width(41.dp)
            .fillMaxHeight(heightFraction)
    ) {
        // Fixed-dimension Fader Body (Never shifts when MIDI Learn toggles!)
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxSize()
                .background(
                    color = if (isSelectedTarget) Color(0xFF0A2236) else Color(0xFF0A0D13),
                    shape = RoundedCornerShape(4.dp)
                )
                .border(
                    width = if (isSelectedTarget) 1.5.dp else 1.dp,
                    color = when {
                        isSelectedTarget -> Color(0xFF38BDF8)
                        isLearnMode -> Color(0xFF0369A1)
                        else -> Color(0xFF162232)
                    },
                    shape = RoundedCornerShape(4.dp)
                )
                .clickable(enabled = isLearnMode) {
                    midiManager.learningTargetKey = param.key
                    onNotifyUiChanged()
                }
                .padding(top = 2.5.dp, bottom = 4.5.dp, start = 2.dp, end = 2.dp)
        ) {
            // Parameter Title Label (Fixed position at top of slot)
            Text(
                text = param.label,
                color = Color(0xFFE5E7EB),
                fontSize = 7.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )

            // Vertical Fader Canvas + Scale Markings
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
                // Left 100 / 50 / 0 Scale Labels
                Column(
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .fillMaxHeight()
                        .padding(vertical = 6.dp, horizontal = 1.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                    horizontalAlignment = Alignment.End
                ) {
                    Text("100", color = Color(0xFF4B5563), fontSize = 5.sp, fontFamily = FontFamily.Monospace)
                    Text("50", color = Color(0xFF4B5563), fontSize = 5.sp, fontFamily = FontFamily.Monospace)
                    Text("0", color = Color(0xFF4B5563), fontSize = 5.sp, fontFamily = FontFamily.Monospace)
                }

                Canvas(modifier = Modifier.fillMaxSize()) {
                    val w = size.width
                    val h = size.height
                    val padY = 8.dp.toPx()
                    val usableH = (h - padY * 2f).coerceAtLeast(10f)
                    val centerX = w * 0.52f

                    // Right-side 3 crisp horizontal tick lines (100, 50, 0)
                    for (idx in 0..2) {
                        val ty = padY + usableH * (idx / 2f)
                        val tickW = if (idx == 1) 6.dp.toPx() else 4.5.dp.toPx()
                        drawLine(
                            color = if (idx == 1) Color(0xFF6B7280) else Color(0xFF4B5563),
                            start = Offset(centerX + 8.dp.toPx(), ty),
                            end = Offset(centerX + 8.dp.toPx() + tickW, ty),
                            strokeWidth = 1.1f
                        )
                    }

                    // Recessed Dark Track Slot
                    val trackW = 5.dp.toPx()
                    drawRoundRect(
                        color = Color(0xFF040609),
                        topLeft = Offset(centerX - trackW * 0.5f, padY),
                        size = Size(trackW, usableH),
                        cornerRadius = CornerRadius(trackW * 0.5f, trackW * 0.5f)
                    )

                    // Ribbed Colored Juno Fader Cap
                    val norm = currentVal.coerceIn(0f, 1f)
                    val capY = padY + usableH * (1f - norm)
                    val capW = 21.dp.toPx()
                    val capH = 12.dp.toPx()

                    drawRoundRect(
                        color = capColor,
                        topLeft = Offset(centerX - capW * 0.5f, capY - capH * 0.5f),
                        size = Size(capW, capH),
                        cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx())
                    )
                    // Subtle highlight border on fader cap
                    drawRoundRect(
                        color = Color(0x44FFFFFF),
                        topLeft = Offset(centerX - capW * 0.5f, capY - capH * 0.5f),
                        size = Size(capW, capH),
                        cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
                        style = Stroke(width = 1f)
                    )
                    // Center dark indicator line on fader cap
                    drawLine(
                        color = Color(0xFF090C10),
                        start = Offset(centerX - capW * 0.32f, capY),
                        end = Offset(centerX + capW * 0.32f, capY),
                        strokeWidth = 2f
                    )
                }
            }

            Spacer(modifier = Modifier.height(3.5.dp))

            // Compact Low-Profile Digital Readout Box at bottom (0 .. 100) with minimal top/bottom padding and separated from fader & bottom border
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .widthIn(min = 21.dp)
                    .height(12.dp)
                    .background(Color(0xFF07090D), RoundedCornerShape(2.dp))
                    .border(0.8.dp, Color(0xFF1B2230), RoundedCornerShape(2.dp))
                    .padding(horizontal = 3.dp)
            ) {
                Text(
                    text = "${(value * 100f).roundToInt().coerceIn(0, 100)}",
                    color = JunoAmberLed,
                    fontSize = 7.sp,
                    lineHeight = 7.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
                )
            }
        }

        // Floating Truly-Rounded Cartridge Badge over the graphical fader area below the title (Zero layout shift!)
        MidiCcBalloonBadge(
            mappedCC = mappedCC,
            mappedChannel = mappedCh,
            isLearnMode = isLearnMode,
            isWaitingCC = isSelectedTarget,
            onSelectForLearn = {
                midiManager.learningTargetKey = param.key
                onNotifyUiChanged()
            },
            onClearMapping = {
                midiManager.clearMappingForParam(param.key)
                onNotifyUiChanged()
            },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = 20.dp)
                .zIndex(30f)
        )
    }
}

/**
 * Truly Rounded, Larger & Clear Blue Cartridge Badge for MIDI Learn (`MidiCcBalloonBadge`):
 * - NEVER participates in layout flow (always rendered as a floating `Box` overlay layer)
 * - ONLY appears when `isLearnMode == true` AND (`mappedCC != null` OR `isWaitingCC == true`)
 * - Positioned inside the graphical area of the target fader or switch (below the parameter title)
 * - Truly rounded pill/cartridge shape (`RoundedCornerShape(50)` when single-line, `RoundedCornerShape(12.dp)` when selected)
 * - When mapped and NOT selected: shows ONLY the MIDI CC name (`CC74`)
 * - When selected (`isWaitingCC == true`) — and ONLY when selected:
 *   - Shows the MIDI CC name (`CC74` or `CC--`)
 *   - Line break below showing the channel (`CH1`)
 *   - Line break below showing `✕` to clear/remove mapping, with compact vertical spacing.
 */
@Composable
private fun MidiCcBalloonBadge(
    mappedCC: Int?,
    mappedChannel: Int?,
    isLearnMode: Boolean,
    isWaitingCC: Boolean,
    preferProgramChangeLabel: Boolean = false,
    onSelectForLearn: () -> Unit,
    onClearMapping: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (!isLearnMode || (mappedCC == null && !isWaitingCC)) return

    val badgeShape = if (isWaitingCC) RoundedCornerShape(12.dp) else RoundedCornerShape(50)
    val badgeTitle = when {
        mappedCC != null && mappedCC >= 1000 -> "PC${mappedCC - 1000}"
        mappedCC != null -> "CC$mappedCC"
        preferProgramChangeLabel -> "PC--"
        else -> "CC--"
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(0.5.dp),
        modifier = modifier
            .clip(badgeShape)
            .background(if (isWaitingCC) Color(0xFF0EA5E9) else Color(0xFF0284C7))
            .border(
                width = 1.2.dp,
                color = if (isWaitingCC) Color.White else Color(0xFFBAE6FD),
                shape = badgeShape
            )
            .clickable { onSelectForLearn() }
            .padding(
                horizontal = if (isWaitingCC) 7.dp else 7.5.dp,
                vertical = if (isWaitingCC) 2.5.dp else 2.dp
            )
    ) {
        // Line 1: MIDI CC or PC Name
        Text(
            text = badgeTitle,
            color = Color.White,
            fontSize = 8.sp,
            lineHeight = 8.5.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
            maxLines = 1
        )

        // ONLY when selected: show Channel on a line break below, and below that the '✕'
        if (isWaitingCC) {
            val chNum = if (mappedChannel != null && mappedChannel in 1..16) mappedChannel else 1
            Text(
                text = "CH$chNum",
                color = Color(0xFFE0F2FE),
                fontSize = 7.sp,
                lineHeight = 7.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1
            )
            Text(
                text = "✕",
                color = Color.White,
                fontSize = 8.sp,
                lineHeight = 8.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                modifier = Modifier.clickable { onClearMapping() }
            )
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

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .width(38.dp)
            .fillMaxHeight()
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .width(36.dp)
                .height(56.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(
                    when {
                        isWaiting -> Color(0xFF0A2236)
                        active -> Color(0xFF241E14)
                        else -> Color(0xFF151821)
                    }
                )
                .border(
                    width = if (isWaiting) 1.5.dp else 1.dp,
                    color = when {
                        isWaiting -> Color(0xFF38BDF8)
                        isLearnMode -> Color(0xFF0369A1)
                        active -> JunoAmberLed
                        else -> Color(0xFF2B3242)
                    },
                    shape = RoundedCornerShape(4.dp)
                )
                .clickable {
                    if (isLearnMode) {
                        midiManager.learningTargetKey = param.key
                        onNotifyUiChanged()
                    } else {
                        onToggle()
                    }
                }
                .padding(vertical = 6.dp, horizontal = 4.dp)
        ) {
            // Square LED Indicator Lens
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (active) JunoAmberLed else Color(0xFF090B10))
                    .border(
                        1.dp,
                        if (active) Color(0xFFFDE68A) else Color(0xFF262C3A),
                        RoundedCornerShape(2.dp)
                    )
            )
            // Roman Numeral I / II
            Text(
                text = romanLabel,
                color = Color(0xFFF3F4F6),
                fontSize = 12.sp,
                fontWeight = FontWeight.Black
            )
            // Tactile bevel line
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(Color(0xFF090B10), RoundedCornerShape(1.dp))
            )
        }

        // Floating Rounded MIDI Cartridge over the Chorus button graphical area (zero layout shift!)
        MidiCcBalloonBadge(
            mappedCC = mappedCC,
            mappedChannel = mappedCh,
            isLearnMode = isLearnMode,
            isWaitingCC = isWaiting,
            onSelectForLearn = {
                midiManager.learningTargetKey = param.key
                onNotifyUiChanged()
            },
            onClearMapping = {
                midiManager.clearMappingForParam(param.key)
                onNotifyUiChanged()
            },
            modifier = Modifier
                .align(Alignment.Center)
                .zIndex(30f)
        )
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
    compact: Boolean = false,
    onToggle: () -> Unit,
    onNotifyUiChanged: () -> Unit
) {
    val revIgnore = uiRevision
    val mappedCC = remember(revIgnore, param) { midiManager.getMappedCC(param.key) }
    val mappedCh = remember(revIgnore, param) { midiManager.getMappedChannel(param.key) }
    val isLearnMode = midiManager.isMidiLearnActive
    val isWaiting = isLearnMode && midiManager.learningTargetKey == param.key

    Box(contentAlignment = Alignment.TopCenter) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .clip(RoundedCornerShape(if (compact) 2.dp else 3.dp))
                .background(
                    when {
                        isWaiting -> Color(0xFF0A2236)
                        active -> activeColor
                        else -> Color(0xFF151922)
                    }
                )
                .border(
                    width = if (isWaiting) 1.2.dp else 0.8.dp,
                    color = when {
                        isWaiting -> Color(0xFF38BDF8)
                        isLearnMode -> Color(0xFF0369A1)
                        active -> Color.White
                        else -> Color(0xFF2B3244)
                    },
                    shape = RoundedCornerShape(if (compact) 2.dp else 3.dp)
                )
                .clickable {
                    if (isLearnMode) {
                        midiManager.learningTargetKey = param.key
                        onNotifyUiChanged()
                    } else {
                        onToggle()
                    }
                }
                .padding(
                    horizontal = if (compact) 4.dp else 4.5.dp,
                    vertical = if (compact) 0.5.dp else 1.dp
                )
        ) {
            Text(
                text = if (active) activeLabel else inactiveLabel,
                color = if (active) Color.Black else Color(0xFF9CA3AF),
                fontSize = if (compact) 6.sp else 6.8.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.ExtraBold
            )
        }

        // Floating Rounded MIDI Cartridge Overlay over the switch graphical area (Zero layout shift!)
        MidiCcBalloonBadge(
            mappedCC = mappedCC,
            mappedChannel = mappedCh,
            isLearnMode = isLearnMode,
            isWaitingCC = isWaiting,
            onSelectForLearn = {
                midiManager.learningTargetKey = param.key
                onNotifyUiChanged()
            },
            onClearMapping = {
                midiManager.clearMappingForParam(param.key)
                onNotifyUiChanged()
            },
            modifier = Modifier
                .align(Alignment.Center)
                .zIndex(30f)
        )
    }
}

@Composable
private fun SelectorGroupBox(
    param: SynthParam,
    title: String,
    options: List<String>,
    selectedIndex: Int,
    midiManager: MidiControllerManager,
    uiRevision: Int,
    onSelect: (Int) -> Unit,
    onNotifyUiChanged: () -> Unit
) {
    val revIgnore = uiRevision
    val mappedCC = remember(revIgnore, param) { midiManager.getMappedCC(param.key) }
    val mappedCh = remember(revIgnore, param) { midiManager.getMappedChannel(param.key) }
    val isLearnMode = midiManager.isMidiLearnActive
    val isWaiting = isLearnMode && midiManager.learningTargetKey == param.key

    Box(contentAlignment = Alignment.TopCenter) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(1.dp),
            modifier = Modifier
                .background(
                    if (isWaiting) Color(0xFF0A2236) else Color(0xFF0D1017),
                    RoundedCornerShape(3.5.dp)
                )
                .border(
                    width = if (isWaiting) 1.5.dp else 1.dp,
                    color = when {
                        isWaiting -> Color(0xFF38BDF8)
                        isLearnMode -> Color(0xFF0369A1)
                        else -> Color(0xFF1D2434)
                    },
                    shape = RoundedCornerShape(3.5.dp)
                )
                .clickable(enabled = isLearnMode) {
                    midiManager.learningTargetKey = param.key
                    onNotifyUiChanged()
                }
                .padding(horizontal = 2.5.dp, vertical = 1.dp)
        ) {
            Text(
                text = title,
                color = Color(0xFF9CA3AF),
                fontSize = 6.2.sp,
                lineHeight = 6.5.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
            for (i in options.indices) {
                val isSel = i == selectedIndex
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .width(30.dp)
                        .height(12.5.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (isSel) Color(0xFFF59E0B) else Color(0xFF171B26))
                        .border(
                            0.8.dp,
                            if (isSel) Color(0xFFFDE68A) else Color(0xFF282F40),
                            RoundedCornerShape(2.dp)
                        )
                        .clickable {
                            if (isLearnMode) {
                                midiManager.learningTargetKey = param.key
                                onNotifyUiChanged()
                            } else {
                                onSelect(i)
                            }
                        }
                ) {
                    Text(
                        text = options[i],
                        color = if (isSel) Color.Black else Color(0xFF9CA3AF),
                        fontSize = 6.5.sp,
                        lineHeight = 6.5.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }

        // Floating MIDI Cartridge Overlay over the switch buttons below the title (Zero layout shift!)
        MidiCcBalloonBadge(
            mappedCC = mappedCC,
            mappedChannel = mappedCh,
            isLearnMode = isLearnMode,
            isWaitingCC = isWaiting,
            onSelectForLearn = {
                midiManager.learningTargetKey = param.key
                onNotifyUiChanged()
            },
            onClearMapping = {
                midiManager.clearMappingForParam(param.key)
                onNotifyUiChanged()
            },
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = 5.dp)
                .zIndex(30f)
        )
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
            .clip(RoundedCornerShape(3.dp))
            .background(if (active) activeColor else Color(0xFF181C26))
            .border(1.dp, if (active) Color.White else Color(0xFF2E3546), RoundedCornerShape(3.dp))
            .clickable { onClick() }
            .padding(horizontal = 6.dp, vertical = 2.5.dp)
    ) {
        Text(
            text = label,
            color = if (active) Color.White else Color(0xFF9CA3AF),
            fontSize = 8.sp,
            fontFamily = FontFamily.Monospace,
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

