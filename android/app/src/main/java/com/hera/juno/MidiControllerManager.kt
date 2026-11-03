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
    val name: String,
    val paramToCC: MutableMap<String, Int>,
    val paramToChannel: MutableMap<String, Int>,
    val sectionChannels: MutableMap<MidiSection, Int>
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
        private const val PREFS_NAME = "hera_native_midi_profiles_v3"
        private const val KEY_PROFILES_JSON = "profiles_json"
        private const val KEY_ACTIVE_PROFILE_ID = "active_profile_id"
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

    var isMidiLearnActive: Boolean = false
    var learningTargetKey: String? = null
    var lastLearnedInfo: String? = null

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
            // DCO (CH 02)
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
            // PRESET ARROWS (Program Change PC0 / PC1 on ARP_PRESETS CH 06)
            SynthParam.PresetPrev.key to 1000,
            SynthParam.PresetNext.key to 1001
        )

        val paramCh = mutableMapOf(
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
            sectionChannels = sectionCh
        )
    }

    private fun createGenericProfile(id: String, name: String): MidiMappingProfile {
        val sectionCh = MidiSection.entries.associateWith { 0 }.toMutableMap()
        return MidiMappingProfile(
            id = id,
            name = name,
            paramToCC = mutableMapOf(),
            paramToChannel = mutableMapOf(),
            sectionChannels = sectionCh
        )
    }

    private fun loadProfiles() {
        profiles.clear()
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        activeProfileId = prefs.getString(KEY_ACTIVE_PROFILE_ID, "launchkey_mk4") ?: "launchkey_mk4"
        val rawJson = prefs.getString(KEY_PROFILES_JSON, null)

        if (!rawJson.isNullOrBlank()) {
            try {
                val root = JSONObject(rawJson)
                val keys = root.keys()
                while (keys.hasNext()) {
                    val id = keys.next()
                    val obj = root.getJSONObject(id)
                    val name = obj.optString("name", id)
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

                    profiles.add(MidiMappingProfile(id, name, ccMap, chMap, secMap))
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        if (profiles.none { it.id == "launchkey_mk4" }) {
            profiles.add(0, createLaunchkeyMk4DefaultProfile())
        }
        if (profiles.none { it.id == "custom_user" }) {
            profiles.add(createGenericProfile("custom_user", "Custom User"))
        }
    }

    fun saveProfiles() {
        try {
            val root = JSONObject()
            for (prof in profiles) {
                val obj = JSONObject()
                obj.put("name", prof.name)

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
                .putString(KEY_ACTIVE_PROFILE_ID, activeProfileId)
                .apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun selectProfile(profileId: String) {
        if (profiles.any { it.id == profileId }) {
            activeProfileId = profileId
            saveProfiles()
            onProfileUpdated()
        }
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

    /**
     * Returns the effective MIDI channel (1..16) for a parameter, or null if OMNI (0).
     * Always prioritizes the parameter's individual learned channel (`paramToChannel`) over the section default (`sectionChannels`),
     * so identical CC numbers (e.g. CC7) on different channels are strictly differentiated.
     */
    fun getMappedChannel(paramKey: String): Int? {
        val prof = getActiveProfile()
        val explicit = prof.paramToChannel[paramKey]
        if (explicit != null && explicit in 1..16) return explicit
        val param = SynthParam.fromKey(paramKey) ?: return null
        val secCh = prof.sectionChannels[param.section] ?: 0
        return if (secCh in 1..16) secCh else null
    }

    private fun getEffectiveChannelForParam(prof: MidiMappingProfile, paramKey: String, param: SynthParam): Int {
        val explicit = prof.paramToChannel[paramKey]
        if (explicit != null && explicit in 1..16) return explicit
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
                if (!keysMatch) return
                val raw14 = (d2 shl 7) or d1
                currentPitchBend = ((raw14 - 8192) / 8192f).coerceIn(-1f, 1f)
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

    private fun handleProgramChange(channel: Int, programNumber: Int) {
        val prof = getActiveProfile()
        val pcCode = 1000 + programNumber.coerceIn(0, 127)

        // 1. If MIDI Learn is active on PresetPrev or PresetNext, map this Program Change (PC#) and its exact channel!
        val targetKey = learningTargetKey
        if (isMidiLearnActive && targetKey != null) {
            val targetParam = SynthParam.fromKey(targetKey)
            if (targetParam == SynthParam.PresetPrev || targetParam == SynthParam.PresetNext) {
                val toRemove = prof.paramToCC.filter { (otherKey, otherCode) ->
                    if (otherKey == targetKey || otherCode != pcCode) return@filter false
                    val otherParam = SynthParam.fromKey(otherKey) ?: return@filter false
                    val otherCh = getEffectiveChannelForParam(prof, otherKey, otherParam)
                    otherCh == channel
                }.keys.toList()
                for (k in toRemove) {
                    prof.paramToCC.remove(k)
                    prof.paramToChannel.remove(k)
                }
                prof.paramToCC[targetKey] = pcCode
                prof.paramToChannel[targetKey] = channel
                learningTargetKey = null
                lastLearnedInfo = "${targetParam.label} -> PC$programNumber (CH$channel)"
                saveProfiles()
                mainHandler.post { onProfileUpdated() }
                return
            }
        }

        // 2. Check if PresetPrev or PresetNext is mapped to this Program Change code on this channel
        val prevCode = prof.paramToCC[SynthParam.PresetPrev.key]
        val prevCh = getEffectiveChannelForParam(prof, SynthParam.PresetPrev.key, SynthParam.PresetPrev)
        if (prevCode == pcCode && (prevCh == 0 || prevCh == channel)) {
            mainHandler.post {
                onPresetStep?.invoke(-1)
                onProfileUpdated()
            }
            return
        }

        val nextCode = prof.paramToCC[SynthParam.PresetNext.key]
        val nextCh = getEffectiveChannelForParam(prof, SynthParam.PresetNext.key, SynthParam.PresetNext)
        if (nextCode == pcCode && (nextCh == 0 || nextCh == channel)) {
            mainHandler.post {
                onPresetStep?.invoke(1)
                onProfileUpdated()
            }
            return
        }

        // 3. Standard MIDI Program Change fallback on ARP_PRESETS or KEYS channel
        val arpSecCh = prof.sectionChannels[MidiSection.ARP_PRESETS] ?: 0
        val keysSecCh = prof.sectionChannels[MidiSection.KEYS] ?: 0
        if (arpSecCh == 0 || arpSecCh == channel || keysSecCh == 0 || keysSecCh == channel) {
            mainHandler.post {
                onProgramChange?.invoke(programNumber)
                onProfileUpdated()
            }
        }
    }

    private fun handleControlChange(channel: Int, cc: Int, value: Int) {
        val prof = getActiveProfile()

        // Ignore Bank Select / Select Change (CC 0 MSB and CC 32 LSB) for Preset Arrows so they only respond to Program Change or dedicated triggers
        val isBankSelectChange = (cc == 0 || cc == 32)

        // 1. MIDI Learn active with a selected control: capture BOTH the CC number AND the exact incoming MIDI channel (1..16)!
        val targetKey = learningTargetKey
        if (isMidiLearnActive && targetKey != null) {
            val targetParam = SynthParam.fromKey(targetKey)
            if (targetParam != null) {
                // Preset navigation arrows must NOT learn Bank Select / Select Change (CC 0 / CC 32)
                if ((targetParam == SynthParam.PresetPrev || targetParam == SynthParam.PresetNext) && isBankSelectChange) {
                    return
                }
                // Only remove an existing mapping if it uses the exact same CC on the exact same effective channel!
                // Same CC on different MIDI channels (e.g. CC7 on CH1 vs CC7 on CH2 vs CC7 on CH6) must NEVER overwrite each other.
                val toRemove = prof.paramToCC.filter { (otherKey, otherCC) ->
                    if (otherKey == targetKey || otherCC != cc) return@filter false
                    val otherParam = SynthParam.fromKey(otherKey) ?: return@filter false
                    val otherEffectiveCh = getEffectiveChannelForParam(prof, otherKey, otherParam)
                    otherEffectiveCh == channel
                }.keys.toList()

                for (k in toRemove) {
                    prof.paramToCC.remove(k)
                    prof.paramToChannel.remove(k)
                }

                prof.paramToCC[targetKey] = cc
                prof.paramToChannel[targetKey] = channel
                learningTargetKey = null
                lastLearnedInfo = "${targetParam.label} -> CC$cc (CH$channel)"
                saveProfiles()
            }
        }

        // 2. Strict (CC + Channel) Resolution:
        //    Each parameter's individual learned channel (`paramToChannel`) takes priority over `sectionChannels`.
        //    NEVER fall back to parameters mapped to the same CC on other MIDI channels!
        val matchedParams = mutableListOf<SynthParam>()

        for ((paramKey, mappedCC) in prof.paramToCC) {
            if (mappedCC != cc) continue
            val param = SynthParam.fromKey(paramKey) ?: continue
            if ((param == SynthParam.PresetPrev || param == SynthParam.PresetNext) && isBankSelectChange) {
                continue
            }
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
                            if (value >= 64) onPresetStep?.invoke(-1)
                        }
                        SynthParam.PresetNext -> {
                            if (value >= 64) onPresetStep?.invoke(1)
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

        // 3. Mod Wheel (CC1) fallback if not mapped on this channel
        val keysCh = prof.sectionChannels[MidiSection.KEYS] ?: 0
        if (cc == 1 && (keysCh == 0 || keysCh == channel)) {
            currentModWheel = (min(100, value) / 100f).coerceIn(0f, 1f)
            val b = currentPitchBend
            val m = currentModWheel
            mainHandler.post { onPitchBend(b, m) }
        }
    }

    private fun computeParamValueFromCC(param: SynthParam, ccValue: Int): Float {
        // User specification:
        // - Switch/Toggle: 0 = OFF (0f), >= 1 = ON (1f)
        // - Multi-position selector: DCORange / DCOPWMMod
        // - Continuous Fader: 0..100 mapped directly to 0.0..1.0, values > 100 clamped to 100 (1.0f)
        return when (param) {
            SynthParam.DCORange -> when {
                ccValue == 0 -> 0f
                ccValue < 64 -> 1f
                else -> 2f
            }
            SynthParam.DCOPWMMod -> when {
                ccValue == 0 -> 0f
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
