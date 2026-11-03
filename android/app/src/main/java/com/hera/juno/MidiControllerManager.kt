package com.hera.juno

import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import kotlin.math.min
import kotlin.math.roundToInt

data class MidiMappingProfile(
    val id: String,
    var name: String,
    val paramToCC: MutableMap<String, Int>,
    val paramToChannel: MutableMap<String, Int>,
    val sectionChannels: MutableMap<MidiSection, Int>,
    var presetChangeMode: String = "program_change" // "program_change" or "custom"
)

class MidiControllerManager(
    private val context: Context,
    private val onNoteOn: (note: Int, velocity: Float) -> Unit,
    private val onNoteOff: (note: Int) -> Unit,
    private val onPitchBend: (bend: Float, mod: Float) -> Unit,
    private val onParamChanged: (param: SynthParam, value: Float) -> Unit,
    private val onProfileUpdated: () -> Unit
) {
    companion object {
        private const val PREFS_NAME = "hera_native_midi_profiles_v4"
        private const val KEY_PROFILES_JSON = "profiles_json"
        private const val KEY_PROFILE_ORDER = "profile_order_csv"
        private const val KEY_ACTIVE_PROFILE_ID = "active_profile_id"
        private const val KEY_SECTION_PROJECTION_ENABLED = "section_projection_enabled"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val midiManager: MidiManager? =
        context.getSystemService(Context.MIDI_SERVICE) as? MidiManager

    private val openDevices = mutableMapOf<Int, MidiDevice>()
    private val openPorts = mutableMapOf<Int, List<MidiOutputPort>>()
    val connectedDeviceNames = mutableListOf<String>()

    val profiles = mutableListOf<MidiMappingProfile>()
    var activeProfileId: String = "launchkey_mk4"
        private set

    var sectionProjectionEnabled: Boolean = true
        private set

    var isMidiLearnActive: Boolean = false
    var learningTargetKey: String? = null
    var lastLearnedInfo: String? = null

    // Tracks recent preset button learn in case hardware sends Bank Select CC + Program Change in one press
    private var lastLearnedPresetTargetKey: String? = null
    private var lastLearnedPresetTimeMs: Long = 0L

    var onPresetStep: ((Int) -> Unit)? = null
    var onProgramChange: ((Int) -> Unit)? = null

    private var currentModWheel: Float = 0f
    private var currentPitchBend: Float = 0f
    private var runningStatus: Int = 0

    private val deviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo) {
            connectToDevice(device)
        }

        override fun onDeviceRemoved(device: MidiDeviceInfo) {
            disconnectDevice(device.id)
        }
    }

    init {
        loadProfiles()
        initHardwareMidi()
    }

    fun getActiveProfile(): MidiMappingProfile {
        return profiles.find { it.id == activeProfileId } ?: profiles.first()
    }

    private fun createLaunchkeyMk4DefaultProfile(): MidiMappingProfile {
        val sectionCh = mutableMapOf(
            MidiSection.KEYS to 2,
            MidiSection.LFO to 1,
            MidiSection.DCO to 2,
            MidiSection.HPF to 6,
            MidiSection.VCF to 6,
            MidiSection.VCA to 2,
            MidiSection.ENV to 2,
            MidiSection.CHORUS to 6,
            MidiSection.DELAY to 6,
            MidiSection.REVERB to 6,
            MidiSection.ARP_PRESETS to 6
        )

        val paramCC = mutableMapOf(
            // DCO (PWM switch -> CC0, LFO -> CC1, PWM -> CC20, PULSE -> CC21, SAW -> CC22, SUB -> CC23)
            SynthParam.DCOPWMMod.key to 0,
            SynthParam.DCOPitchModDepth.key to 1,
            SynthParam.DCOPWMDepth.key to 20,
            SynthParam.DCOPulseLevel.key to 21,
            SynthParam.DCOSawLevel.key to 22,
            SynthParam.DCOSubLevel.key to 23,
            // VCF (CH 06)
            SynthParam.VCFCutoff.key to 2,
            // VCA (CH 02)
            SynthParam.VCADepth.key to 7,
            // ENV (CH 02)
            SynthParam.ENVAttack.key to 24,
            SynthParam.ENVRelease.key to 25,
            // ECHO DELAY (CH 06)
            SynthParam.DelayEnabled.key to 8,
            SynthParam.DelayFeedback.key to 9,
            SynthParam.DelayMix.key to 11,
            // REVERB GLOBAL (CH 06)
            SynthParam.ReverbEnabled.key to 17,
            SynthParam.ReverbDecay.key to 6,
            SynthParam.ReverbMix.key to 7,
            // PRESET ARROWS (Program Change PC115 / PC114)
            SynthParam.PresetPrev.key to 1115,
            SynthParam.PresetNext.key to 1114
        )

        val paramCh = mutableMapOf(
            SynthParam.DCOPWMMod.key to 6,
            SynthParam.DCOPitchModDepth.key to 2,
            SynthParam.DCOPWMDepth.key to 2,
            SynthParam.DCOPulseLevel.key to 2,
            SynthParam.DCOSawLevel.key to 2,
            SynthParam.DCOSubLevel.key to 2,
            SynthParam.VCFCutoff.key to 6,
            SynthParam.VCADepth.key to 2,
            SynthParam.ENVAttack.key to 2,
            SynthParam.ENVRelease.key to 2,
            SynthParam.DelayEnabled.key to 6,
            SynthParam.DelayFeedback.key to 6,
            SynthParam.DelayMix.key to 6,
            SynthParam.ReverbEnabled.key to 6,
            SynthParam.ReverbDecay.key to 6,
            SynthParam.ReverbMix.key to 6,
            SynthParam.PresetPrev.key to 6,
            SynthParam.PresetNext.key to 6
        )

        return MidiMappingProfile(
            id = "launchkey_mk4",
            name = "Launchkey MK4",
            paramToCC = paramCC,
            paramToChannel = paramCh,
            sectionChannels = sectionCh,
            presetChangeMode = "program_change"
        )
    }

    private fun createGenericProfile(id: String, name: String): MidiMappingProfile {
        val sectionCh = MidiSection.entries.associateWith { 0 }.toMutableMap()
        return MidiMappingProfile(
            id = id,
            name = name,
            paramToCC = mutableMapOf(),
            paramToChannel = mutableMapOf(),
            sectionChannels = sectionCh,
            presetChangeMode = "custom"
        )
    }

    private fun loadProfiles() {
        profiles.clear()
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        activeProfileId = prefs.getString(KEY_ACTIVE_PROFILE_ID, "launchkey_mk4") ?: "launchkey_mk4"
        sectionProjectionEnabled = prefs.getBoolean(KEY_SECTION_PROJECTION_ENABLED, true)
        val rawJson = prefs.getString(KEY_PROFILES_JSON, null)
        val orderCsv = prefs.getString(KEY_PROFILE_ORDER, null)

        val loadedMap = mutableMapOf<String, MidiMappingProfile>()

        if (!rawJson.isNullOrBlank()) {
            try {
                val root = JSONObject(rawJson)
                val keys = root.keys()
                while (keys.hasNext()) {
                    val id = keys.next()
                    val obj = root.getJSONObject(id)
                    val name = obj.optString("name", id)
                    val presetMode = obj.optString("presetChangeMode", "program_change")
                        .let { if (it == "custom" || it == "program_change") it else "program_change" }
                    val ccMap = mutableMapOf<String, Int>()
                    val chMap = mutableMapOf<String, Int>()
                    val secMap = MidiSection.entries.associateWith { 0 }.toMutableMap()

                    obj.optJSONObject("paramToCC")?.let { ccObj ->
                        val kIt = ccObj.keys()
                        while (kIt.hasNext()) {
                            val k = kIt.next()
                            ccMap[k] = ccObj.optInt(k)
                        }
                    }
                    obj.optJSONObject("paramToChannel")?.let { chObj ->
                        val kIt = chObj.keys()
                        while (kIt.hasNext()) {
                            val k = kIt.next()
                            chMap[k] = chObj.optInt(k)
                        }
                    }
                    obj.optJSONObject("sectionChannels")?.let { sObj ->
                        for (sec in MidiSection.entries) {
                            if (sObj.has(sec.key)) {
                                secMap[sec] = sObj.optInt(sec.key, 0)
                            }
                        }
                    }

                    for ((k, _) in ccMap) {
                        if (!chMap.containsKey(k) || (chMap[k] ?: 0) !in 1..16) {
                            val p = SynthParam.fromKey(k)
                            val secCh = if (p != null) (secMap[p.section] ?: 0) else 0
                            if (secCh in 1..16) {
                                chMap[k] = secCh
                            }
                        }
                    }

                    loadedMap[id] = MidiMappingProfile(id, name, ccMap, chMap, secMap, presetMode)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        if (!orderCsv.isNullOrBlank()) {
            for (id in orderCsv.split(",")) {
                val trimmed = id.trim()
                val prof = loadedMap.remove(trimmed)
                if (prof != null) {
                    profiles.add(prof)
                }
            }
        }
        for ((_, prof) in loadedMap) {
            profiles.add(prof)
        }

        if (profiles.none { it.id == "launchkey_mk4" }) {
            profiles.add(0, createLaunchkeyMk4DefaultProfile())
        }
        if (profiles.size == 1 && rawJson.isNullOrBlank()) {
            profiles.add(createGenericProfile("custom_user", "Custom User"))
        }
        if (profiles.none { it.id == activeProfileId }) {
            activeProfileId = profiles.first().id
        }
    }

    fun saveProfiles() {
        try {
            val root = JSONObject()
            val orderList = mutableListOf<String>()
            for (prof in profiles) {
                orderList.add(prof.id)
                val obj = JSONObject()
                obj.put("name", prof.name)
                obj.put("presetChangeMode", prof.presetChangeMode)

                val ccObj = JSONObject()
                for ((k, v) in prof.paramToCC) ccObj.put(k, v)
                obj.put("paramToCC", ccObj)

                val chObj = JSONObject()
                for ((k, v) in prof.paramToChannel) chObj.put(k, v)
                obj.put("paramToChannel", chObj)

                val secObj = JSONObject()
                for ((sec, ch) in prof.sectionChannels) secObj.put(sec.key, ch)
                obj.put("sectionChannels", secObj)

                root.put(prof.id, obj)
            }

            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PROFILES_JSON, root.toString())
                .putString(KEY_PROFILE_ORDER, orderList.joinToString(","))
                .putString(KEY_ACTIVE_PROFILE_ID, activeProfileId)
                .putBoolean(KEY_SECTION_PROJECTION_ENABLED, sectionProjectionEnabled)
                .apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setSectionProjection(enabled: Boolean) {
        sectionProjectionEnabled = enabled
        saveProfiles()
        onProfileUpdated()
    }

    fun selectProfile(profileId: String) {
        if (profiles.any { it.id == profileId }) {
            activeProfileId = profileId
            saveProfiles()
            onProfileUpdated()
        }
    }

    fun createProfile(customName: String? = null): MidiMappingProfile {
        val current = getActiveProfile()
        val nextNum = profiles.size + 1
        val finalName = customName?.trim()?.takeIf { it.isNotEmpty() } ?: "Perfil $nextNum"
        val newId = "profile_${System.currentTimeMillis()}"
        val newProfile = MidiMappingProfile(
            id = newId,
            name = finalName,
            paramToCC = current.paramToCC.toMutableMap(),
            paramToChannel = current.paramToChannel.toMutableMap(),
            sectionChannels = current.sectionChannels.toMutableMap(),
            presetChangeMode = current.presetChangeMode
        )
        profiles.add(newProfile)
        activeProfileId = newId
        saveProfiles()
        onProfileUpdated()
        return newProfile
    }

    fun renameProfile(profileId: String, newName: String) {
        val trimmed = newName.trim()
        if (trimmed.isEmpty()) return
        val target = profiles.find { it.id == profileId } ?: return
        target.name = trimmed
        saveProfiles()
        onProfileUpdated()
    }

    fun deleteProfile(profileId: String) {
        if (profileId == "launchkey_mk4" || profiles.size <= 1) return
        val removed = profiles.removeAll { it.id == profileId }
        if (removed) {
            if (activeProfileId == profileId) {
                activeProfileId = profiles.first().id
            }
            saveProfiles()
            onProfileUpdated()
        }
    }

    fun setPresetChangeMode(mode: String) {
        val valid = if (mode == "custom") "custom" else "program_change"
        val prof = getActiveProfile()
        prof.presetChangeMode = valid
        saveProfiles()
        onProfileUpdated()
    }

    fun getPresetChangeMode(): String {
        return getActiveProfile().presetChangeMode
    }

    fun resetActiveProfileToFactory() {
        val idx = profiles.indexOfFirst { it.id == activeProfileId }
        if (idx >= 0) {
            profiles[idx] = if (activeProfileId == "launchkey_mk4") {
                createLaunchkeyMk4DefaultProfile()
            } else {
                createGenericProfile(activeProfileId, profiles[idx].name)
            }
            saveProfiles()
            onProfileUpdated()
        }
    }

    fun setSectionChannel(section: MidiSection, channel: Int) {
        val prof = getActiveProfile()
        val clamped = channel.coerceIn(0, 16)
        prof.sectionChannels[section] = clamped
        for ((paramKey, _) in prof.paramToCC) {
            val param = SynthParam.fromKey(paramKey) ?: continue
            if (param == SynthParam.PresetPrev ||
                param == SynthParam.PresetNext ||
                param == SynthParam.PresetSelect
            ) {
                continue
            }
            if (param.section == section) {
                if (clamped == 0) {
                    prof.paramToChannel.remove(paramKey)
                } else {
                    prof.paramToChannel[paramKey] = clamped
                }
            }
        }
        saveProfiles()
        onProfileUpdated()
    }

    fun setAllFxSectionsChannel(channel: Int) {
        val prof = getActiveProfile()
        val ch = channel.coerceIn(0, 16)
        for (sec in MidiSection.entries) {
            if (sec != MidiSection.KEYS) {
                prof.sectionChannels[sec] = ch
            }
        }
        for ((paramKey, _) in prof.paramToCC) {
            val param = SynthParam.fromKey(paramKey) ?: continue
            if (param == SynthParam.PresetPrev ||
                param == SynthParam.PresetNext ||
                param == SynthParam.PresetSelect
            ) {
                continue
            }
            if (param.section != MidiSection.KEYS) {
                if (ch == 0) {
                    prof.paramToChannel.remove(paramKey)
                } else {
                    prof.paramToChannel[paramKey] = ch
                }
            }
        }
        saveProfiles()
        onProfileUpdated()
    }

    fun clearMappingForParam(paramKey: String) {
        val prof = getActiveProfile()
        prof.paramToCC.remove(paramKey)
        prof.paramToChannel.remove(paramKey)
        if (learningTargetKey == paramKey) {
            learningTargetKey = null
        }
        saveProfiles()
        onProfileUpdated()
    }

    fun getMappedCC(paramKey: String): Int? = getActiveProfile().paramToCC[paramKey]

    fun getPresetMappedChannel(prof: MidiMappingProfile = getActiveProfile()): Int {
        val ch = prof.paramToChannel[SynthParam.PresetSelect.key]
            ?: prof.paramToChannel[SynthParam.PresetPrev.key]
            ?: prof.paramToChannel[SynthParam.PresetNext.key]
        return if (ch != null && ch in 1..16) ch else 0
    }

    /**
     * Returns the effective MIDI channel (1..16) for a parameter, or null if OMNI (0).
     * Always prioritizes the parameter's individual learned channel (`paramToChannel`) over the section default (`sectionChannels`),
     * and for preset controls uses the mapped button's channel rather than tying to the section channel.
     */
    fun getMappedChannel(paramKey: String): Int? {
        val prof = getActiveProfile()
        val explicit = prof.paramToChannel[paramKey]
        if (explicit != null && explicit in 1..16) return explicit
        val param = SynthParam.fromKey(paramKey) ?: return null
        if (param == SynthParam.PresetPrev ||
            param == SynthParam.PresetNext ||
            param == SynthParam.PresetSelect
        ) {
            val presetCh = getPresetMappedChannel(prof)
            return if (presetCh in 1..16) presetCh else null
        }
        val secCh = prof.sectionChannels[param.section] ?: 0
        return if (secCh in 1..16) secCh else null
    }

    private fun getEffectiveChannelForParam(prof: MidiMappingProfile, paramKey: String, param: SynthParam): Int {
        val explicit = prof.paramToChannel[paramKey]
        if (explicit != null && explicit in 1..16) return explicit
        if (param == SynthParam.PresetPrev ||
            param == SynthParam.PresetNext ||
            param == SynthParam.PresetSelect
        ) {
            return getPresetMappedChannel(prof)
        }
        val secCh = prof.sectionChannels[param.section] ?: 0
        return if (secCh in 1..16) secCh else 0
    }

    private fun initHardwareMidi() {
        val mgr = midiManager ?: return
        mgr.registerDeviceCallback(deviceCallback, mainHandler)
        val infos = mgr.devices
        for (info in infos) {
            connectToDevice(info)
        }
    }

    private fun connectToDevice(info: MidiDeviceInfo) {
        val mgr = midiManager ?: return
        if (openDevices.containsKey(info.id)) return
        if (info.outputPortCount <= 0) return

        mgr.openDevice(info, { device ->
            if (device == null) return@openDevice
            openDevices[info.id] = device
            val ports = mutableListOf<MidiOutputPort>()
            for (i in 0 until info.outputPortCount) {
                val port = device.openOutputPort(i)
                if (port != null) {
                    port.connect(midiReceiver)
                    ports.add(port)
                }
            }
            openPorts[info.id] = ports

            val name = info.properties.getString(MidiDeviceInfo.PROPERTY_NAME)
                ?: info.properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
                ?: "MIDI Device ${info.id}"
            if (!connectedDeviceNames.contains(name)) {
                connectedDeviceNames.add(name)
            }
            mainHandler.post { onProfileUpdated() }
        }, mainHandler)
    }

    private fun disconnectDevice(deviceId: Int) {
        openPorts.remove(deviceId)?.forEach {
            try {
                it.close()
            } catch (_: Exception) {
            }
        }
        openDevices.remove(deviceId)?.let {
            try {
                it.close()
            } catch (_: Exception) {
            }
        }
        mainHandler.post { onProfileUpdated() }
    }

    fun release() {
        midiManager?.unregisterDeviceCallback(deviceCallback)
        val ids = openDevices.keys.toList()
        for (id in ids) disconnectDevice(id)
    }

    private val midiReceiver = object : MidiReceiver() {
        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            parseMidiPacket(msg, offset, count)
        }
    }

    private fun dataBytesForStatus(statusHi: Int): Int {
        return when (statusHi) {
            0x80, 0x90, 0xA0, 0xB0, 0xE0 -> 2
            0xC0, 0xD0 -> 1
            else -> 0
        }
    }

    private fun parseMidiPacket(data: ByteArray, offset: Int, count: Int) {
        var i = offset
        val end = offset + count

        while (i < end) {
            val b = data[i].toInt() and 0xFF

            // Real-time system messages (0xF8..0xFF) can appear anywhere without resetting running status
            if (b >= 0xF8) {
                i++
                continue
            }

            // System Common / SysEx (0xF0..0xF7)
            if (b in 0xF0..0xF7) {
                runningStatus = 0
                if (b == 0xF0) {
                    i++
                    while (i < end && (data[i].toInt() and 0xFF) != 0xF7) {
                        i++
                    }
                    if (i < end) i++
                } else {
                    i++
                }
                continue
            }

            val status: Int
            if ((b and 0x80) != 0) {
                status = b
                runningStatus = b
                i++
            } else {
                if (runningStatus == 0) {
                    i++
                    continue
                }
                status = runningStatus
            }

            val needed = dataBytesForStatus(status and 0xF0)
            if (needed <= 0 || i + needed > end) {
                break
            }

            val d1 = data[i].toInt() and 0x7F
            val d2 = if (needed == 2) (data[i + 1].toInt() and 0x7F) else 0
            i += needed

            handleShortMidiMessage(status, d1, d2)
        }
    }

    private fun handleShortMidiMessage(status: Int, d1: Int, d2: Int) {
        val cmd = status and 0xF0
        val channel = (status and 0x0F) + 1 // 1..16
        val prof = getActiveProfile()
        val keysChannel = prof.sectionChannels[MidiSection.KEYS] ?: 0
        val keysMatch = (keysChannel == 0 || keysChannel == channel)

        when (cmd) {
            0x90 -> {
                if (!keysMatch) return
                if (d2 > 0) {
                    val vel = (d2 / 127f).coerceIn(0.05f, 1.0f)
                    mainHandler.post { onNoteOn(d1, vel) }
                } else {
                    mainHandler.post { onNoteOff(d1) }
                }
            }
            0x80 -> {
                if (!keysMatch) return
                mainHandler.post { onNoteOff(d1) }
            }
            0xE0 -> {
                val raw14 = (d2 shl 7) or d1
                val bendNorm = ((raw14 - 8192) / 8192f).coerceIn(-1f, 1f)

                // Support MIDI Learn for Pitch Bend wheel (code 2000 = PB)
                val targetKey = learningTargetKey
                if (isMidiLearnActive && targetKey != null) {
                    val targetParam = SynthParam.fromKey(targetKey)
                    if (targetParam == SynthParam.PitchWheel || targetParam == SynthParam.ModWheel) {
                        assignLearnedMapping(prof, targetKey, targetParam, 2000, channel)
                        return
                    }
                }

                // Check if PitchWheel or ModWheel is explicitly mapped to PB (2000)
                val pitchMappedCC = prof.paramToCC[SynthParam.PitchWheel.key]
                val modMappedCC = prof.paramToCC[SynthParam.ModWheel.key]
                if (modMappedCC == 2000) {
                    val modCh = getEffectiveChannelForParam(prof, SynthParam.ModWheel.key, SynthParam.ModWheel)
                    if (modCh == 0 || modCh == channel) {
                        currentModWheel = ((bendNorm + 1f) * 0.5f).coerceIn(0f, 1f)
                        val b = currentPitchBend
                        val m = currentModWheel
                        mainHandler.post { onPitchBend(b, m) }
                        return
                    }
                }
                if (pitchMappedCC != null && pitchMappedCC != 2000) {
                    // Pitch wheel was remapped to a custom CC, so ignore default 0xE0 unless it matches PB
                    return
                }
                val pitchCh = if (pitchMappedCC == 2000) {
                    getEffectiveChannelForParam(prof, SynthParam.PitchWheel.key, SynthParam.PitchWheel)
                } else {
                    keysChannel
                }
                if (pitchCh != 0 && pitchCh != channel) return

                currentPitchBend = bendNorm
                val b = currentPitchBend
                val m = currentModWheel
                mainHandler.post { onPitchBend(b, m) }
            }
            0xB0 -> {
                handleControlChange(channel, d1, d2)
            }
            0xC0 -> {
                handleProgramChange(channel, d1)
            }
        }
    }

    private fun assignLearnedMapping(
        prof: MidiMappingProfile,
        targetKey: String,
        targetParam: SynthParam,
        code: Int,
        channel: Int
    ) {
        // Remove any conflicting parameter that uses the same code (CC or PC) on the same channel or OMNI
        val toRemove = prof.paramToCC.filter { (otherKey, otherCode) ->
            if (otherKey == targetKey || otherCode != code) return@filter false
            val otherParam = SynthParam.fromKey(otherKey) ?: return@filter false
            val otherCh = getEffectiveChannelForParam(prof, otherKey, otherParam)
            otherCh == channel || otherCh == 0 || channel == 0
        }.keys.toList()

        for (k in toRemove) {
            prof.paramToCC.remove(k)
            prof.paramToChannel.remove(k)
        }

        prof.paramToCC[targetKey] = code
        prof.paramToChannel[targetKey] = channel

        if (targetParam == SynthParam.PresetPrev ||
            targetParam == SynthParam.PresetNext ||
            targetParam == SynthParam.PresetSelect
        ) {
            prof.presetChangeMode = "custom"
        }

        learningTargetKey = null
        val codeLabel = when {
            code == 2000 -> "PB"
            code >= 1000 -> "PC${code - 1000}"
            else -> "CC$code"
        }
        lastLearnedInfo = "${targetParam.label} -> $codeLabel (CH$channel)"
        saveProfiles()
        mainHandler.post { onProfileUpdated() }
    }

    private fun handleProgramChange(channel: Int, programNumber: Int) {
        val prof = getActiveProfile()
        val pcCode = 1000 + programNumber.coerceIn(0, 127)
        val now = System.currentTimeMillis()

        // 1. If MIDI Learn is active on PresetPrev, PresetNext, or PresetSelect (or if a Bank Select CC just arrived < 250ms ago for a preset target),
        //    map this Program Change (PC#) and its exact channel!
        val activeTargetKey = learningTargetKey ?: if (now - lastLearnedPresetTimeMs < 250L) lastLearnedPresetTargetKey else null
        if (isMidiLearnActive && activeTargetKey != null) {
            val targetParam = SynthParam.fromKey(activeTargetKey)
            if (targetParam == SynthParam.PresetPrev ||
                targetParam == SynthParam.PresetNext ||
                targetParam == SynthParam.PresetSelect
            ) {
                lastLearnedPresetTargetKey = null
                lastLearnedPresetTimeMs = 0L
                assignLearnedMapping(prof, activeTargetKey, targetParam, pcCode, channel)
                return
            }
        }

        // 2. Check if PresetPrev or PresetNext is specifically mapped to this Program Change code (accepts mapped button's channel or any channel if unique PC)
        val prevCode = prof.paramToCC[SynthParam.PresetPrev.key]
        val prevCh = getEffectiveChannelForParam(prof, SynthParam.PresetPrev.key, SynthParam.PresetPrev)
        if (prevCode == pcCode && (prevCh == 0 || prevCh == channel || prof.presetChangeMode == "program_change")) {
            mainHandler.post {
                onPresetStep?.invoke(-1)
                onProfileUpdated()
            }
            return
        }

        val nextCode = prof.paramToCC[SynthParam.PresetNext.key]
        val nextCh = getEffectiveChannelForParam(prof, SynthParam.PresetNext.key, SynthParam.PresetNext)
        if (nextCode == pcCode && (nextCh == 0 || nextCh == channel || prof.presetChangeMode == "program_change")) {
            mainHandler.post {
                onPresetStep?.invoke(1)
                onProfileUpdated()
            }
            return
        }

        // 3. If PresetSelect is mapped to Program Change (>= 1000) on this button's channel,
        //    ANY Program Change (0..127) on that mapped button's channel selects the preset!
        val selectCode = prof.paramToCC[SynthParam.PresetSelect.key]
        val selectCh = getEffectiveChannelForParam(prof, SynthParam.PresetSelect.key, SynthParam.PresetSelect)
        if (selectCode != null && selectCode >= 1000 && (selectCh == 0 || selectCh == channel)) {
            mainHandler.post {
                onProgramChange?.invoke(programNumber)
                onProfileUpdated()
            }
            return
        }

        // 4. Program Change preset selection:
        //    Uses the channel of the mapped preset button (if any preset button was mapped on a channel),
        //    or accepts any channel (OMNI) when in "program_change" mode — never locked to the section channel!
        val mappedPresetCh = getPresetMappedChannel(prof)
        val isMappedButtonChannelMatch = (mappedPresetCh == 0 || mappedPresetCh == channel)

        if (prof.presetChangeMode == "program_change") {
            val arpSecCh = prof.sectionChannels[MidiSection.ARP_PRESETS] ?: 0
            val keysSecCh = prof.sectionChannels[MidiSection.KEYS] ?: 0
            if (isMappedButtonChannelMatch || arpSecCh == 0 || arpSecCh == channel || keysSecCh == 0 || keysSecCh == channel) {
                mainHandler.post {
                    onProgramChange?.invoke(programNumber)
                    onProfileUpdated()
                }
            }
        } else if (mappedPresetCh in 1..16 && channel == mappedPresetCh && selectCode == null) {
            val isPrevNextUsingPC = (prevCode != null && prevCode >= 1000) || (nextCode != null && nextCode >= 1000)
            if (!isPrevNextUsingPC) {
                mainHandler.post {
                    onProgramChange?.invoke(programNumber)
                    onProfileUpdated()
                }
            }
        }
    }

    private fun handleControlChange(channel: Int, cc: Int, value: Int) {
        val prof = getActiveProfile()

        // 1. MIDI Learn active with a selected control: capture BOTH the CC number AND the exact incoming MIDI channel (1..16)!
        val targetKey = learningTargetKey
        if (isMidiLearnActive && targetKey != null) {
            val targetParam = SynthParam.fromKey(targetKey)
            if (targetParam != null) {
                val isPresetTarget = targetParam == SynthParam.PresetPrev ||
                    targetParam == SynthParam.PresetNext ||
                    targetParam == SynthParam.PresetSelect
                val isMomentaryButton = targetParam == SynthParam.PresetPrev ||
                    targetParam == SynthParam.PresetNext ||
                    targetParam == SynthParam.LFOManualTrig

                // Ignore button release (value == 0) or Bank Select 0 prefix on momentary buttons during learn
                if (isMomentaryButton && value == 0) {
                    return
                }

                if (isPresetTarget) {
                    lastLearnedPresetTargetKey = targetKey
                    lastLearnedPresetTimeMs = System.currentTimeMillis()
                }

                assignLearnedMapping(prof, targetKey, targetParam, cc, channel)
                return
            }
        }

        // 2. Strict (CC + Channel) Resolution:
        //    Each parameter's individual learned channel (`paramToChannel`) takes priority over `sectionChannels`.
        //    NEVER fall back to parameters mapped to the same CC on other MIDI channels!
        val matchedParams = mutableListOf<SynthParam>()

        for ((paramKey, mappedCC) in prof.paramToCC) {
            if (mappedCC != cc) continue
            val param = SynthParam.fromKey(paramKey) ?: continue
            val effectiveCh = getEffectiveChannelForParam(prof, paramKey, param)
            if (effectiveCh == channel || effectiveCh == 0) {
                matchedParams.add(param)
            }
        }

        if (matchedParams.isNotEmpty()) {
            mainHandler.post {
                for (param in matchedParams) {
                    when (param) {
                        SynthParam.PresetPrev -> {
                            if (value >= 1) onPresetStep?.invoke(-1)
                        }
                        SynthParam.PresetNext -> {
                            if (value >= 1) onPresetStep?.invoke(1)
                        }
                        SynthParam.PresetSelect -> {
                            onProgramChange?.invoke(value.coerceAtLeast(0))
                        }
                        SynthParam.PitchWheel -> {
                            currentPitchBend = ((min(100, value.coerceAtLeast(0)) / 100f) * 2f - 1f).coerceIn(-1f, 1f)
                            onPitchBend(currentPitchBend, currentModWheel)
                        }
                        SynthParam.ModWheel -> {
                            currentModWheel = (min(100, value.coerceAtLeast(0)) / 100f).coerceIn(0f, 1f)
                            onPitchBend(currentPitchBend, currentModWheel)
                        }
                        else -> {
                            val newVal = computeParamValueFromCC(param, value)
                            onParamChanged(param, newVal)
                        }
                    }
                }
                onProfileUpdated()
            }
            return
        }

        // 3. Mod Wheel / DCO LFO (CC1) fallback on KEYS or LFO channel if not matched above
        val keysCh = prof.sectionChannels[MidiSection.KEYS] ?: 0
        val lfoCh = prof.sectionChannels[MidiSection.LFO] ?: 0
        if (cc == 1 && (keysCh == 0 || keysCh == channel || lfoCh == 0 || lfoCh == channel)) {
            if (prof.paramToCC[SynthParam.DCOPitchModDepth.key] == 1) {
                val newVal = computeParamValueFromCC(SynthParam.DCOPitchModDepth, value)
                mainHandler.post {
                    onParamChanged(SynthParam.DCOPitchModDepth, newVal)
                    onProfileUpdated()
                }
            } else {
                currentModWheel = (min(100, value) / 100f).coerceIn(0f, 1f)
                val b = currentPitchBend
                val m = currentModWheel
                mainHandler.post { onPitchBend(b, m) }
            }
        }
    }

    private fun computeParamValueFromCC(param: SynthParam, ccValue: Int): Float {
        // User specification:
        // - 3-position switches (DCORange, DCOPWMMod): discrete values 0 -> 0f, 1 -> 1f, 2 -> 2f (fallback < 64 -> 1f, >= 64 -> 2f)
        // - 2-position switches/toggles: 0 = OFF (0f), >= 1 = ON (1f)
        // - Continuous Fader: 0..100 mapped directly to 0.0..1.0, values > 100 clamped to 100 (1.0f)
        return when (param) {
            SynthParam.DCORange,
            SynthParam.DCOPWMMod -> when {
                ccValue <= 0 -> 0f
                ccValue == 1 -> 1f
                ccValue == 2 -> 2f
                ccValue < 64 -> 1f
                else -> 2f
            }
            SynthParam.VCAType,
            SynthParam.LFOTrigMode,
            SynthParam.LFOManualTrig,
            SynthParam.ChorusI,
            SynthParam.ChorusII,
            SynthParam.DelayEnabled,
            SynthParam.ReverbEnabled,
            SynthParam.ReverbType -> if (ccValue >= 1) 1f else 0f
            else -> (min(100, ccValue.coerceAtLeast(0)) / 100f).coerceIn(0f, 1f)
        }
    }
}
