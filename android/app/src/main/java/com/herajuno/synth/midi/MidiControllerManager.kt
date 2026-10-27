package com.herajuno.synth.midi

import android.content.Context
import android.media.midi.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.herajuno.synth.audio.NativeAudioEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class MidiDeviceInfoModel(
    val id: Int,
    val name: String,
    val isUsb: Boolean,
    val isBluetooth: Boolean
)

object MidiParams {
    const val DCO_RANGE = 0
    const val LFO_TRIG_MODE = 1
    const val PWM_MOD = 2
    const val DCO_PITCH_MOD = 3
    const val DCO_PWM_DEPTH = 4
    const val DCO_PULSE_LEVEL = 5
    const val DCO_SAW_LEVEL = 6
    const val DCO_SUB_LEVEL = 7
    const val DCO_NOISE_LEVEL = 8
    const val HPF = 9
    const val VCF_CUTOFF = 10
    const val VCF_RESONANCE = 11
    const val VCF_ENV_MOD = 12
    const val VCF_LFO_MOD = 13
    const val VCF_KEY_FOLLOW = 14
    const val VCF_BEND_DEPTH = 15
    const val LFO_RATE = 16
    const val LFO_DELAY = 17
    const val VCA_TYPE = 18
    const val VCA_DEPTH = 19
    const val ENV_ATTACK = 20
    const val ENV_DECAY = 21
    const val ENV_SUSTAIN = 22
    const val ENV_RELEASE = 23
    const val CHORUS_I = 24
    const val CHORUS_II = 25
}

class MidiControllerManager(private val context: Context) {
    private val TAG = "MidiControllerManager"
    private var midiManager: MidiManager? = null
    private val openDevices = mutableListOf<MidiDevice>()
    private val openInputPorts = mutableListOf<MidiOutputPort>()

    private val _connectedDevices = MutableStateFlow<List<MidiDeviceInfoModel>>(emptyList())
    val connectedDevices: StateFlow<List<MidiDeviceInfoModel>> = _connectedDevices

    private val _midiActivity = MutableStateFlow(false)
    val midiActivity: StateFlow<Boolean> = _midiActivity

    // CC Mapping: CC Number (0..127) -> Hera Param ID (0..25)
    private val ccMapping = mutableMapOf<Int, Int>(
        1 to MidiParams.DCO_PITCH_MOD,      // Standard Modulation Wheel
        7 to MidiParams.VCA_DEPTH,           // Standard Volume
        14 to MidiParams.DCO_RANGE,          // DCO Range
        15 to MidiParams.PWM_MOD,            // DCO PWM Mod Source
        16 to MidiParams.DCO_PWM_DEPTH,      // PWM Depth
        18 to MidiParams.DCO_PULSE_LEVEL,    // Pulse Level
        19 to MidiParams.DCO_SAW_LEVEL,      // Saw Level
        20 to MidiParams.DCO_SUB_LEVEL,      // Sub Level
        21 to MidiParams.DCO_NOISE_LEVEL,    // Noise Level
        22 to MidiParams.HPF,                // HPF
        74 to MidiParams.VCF_CUTOFF,         // Standard Brightness / Cutoff
        71 to MidiParams.VCF_RESONANCE,      // Standard Resonance
        23 to MidiParams.VCF_ENV_MOD,        // VCF Env Depth
        24 to MidiParams.VCF_LFO_MOD,        // VCF LFO Depth
        25 to MidiParams.VCF_KEY_FOLLOW,     // VCF Key Follow
        28 to MidiParams.LFO_RATE,           // LFO Rate
        29 to MidiParams.LFO_DELAY,          // LFO Delay
        27 to MidiParams.VCA_TYPE,           // VCA Type (Env/Gate)
        73 to MidiParams.ENV_ATTACK,         // Standard Attack
        75 to MidiParams.ENV_DECAY,          // Standard Decay
        79 to MidiParams.ENV_SUSTAIN,        // Standard Sustain
        72 to MidiParams.ENV_RELEASE,        // Standard Release
        80 to MidiParams.CHORUS_I,           // Chorus I
        81 to MidiParams.CHORUS_II           // Chorus II
    )

    // Interactive MIDI Learn Mode
    var learningParamId: Int? = null

    fun init() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
            scanDevices()

            midiManager?.registerDeviceCallback(object : MidiManager.DeviceCallback() {
                override fun onDeviceAdded(device: MidiDeviceInfo?) {
                    scanDevices()
                }

                override fun onDeviceRemoved(device: MidiDeviceInfo?) {
                    scanDevices()
                }
            }, Handler(Looper.getMainLooper()))
        }
    }

    fun scanDevices() {
        val mm = midiManager ?: return
        val infos = mm.devices
        val deviceModels = mutableListOf<MidiDeviceInfoModel>()

        // Close stale ports
        openInputPorts.forEach { runCatching { it.close() } }
        openInputPorts.clear()
        openDevices.forEach { runCatching { it.close() } }
        openDevices.clear()

        for (info in infos) {
            if (info.inputPortCount > 0 || info.outputPortCount > 0) {
                val prop = info.properties
                val name = prop.getString(MidiDeviceInfo.PROPERTY_NAME) ?: "MIDI Device ${info.id}"
                val isBluetooth = (info.type == MidiDeviceInfo.TYPE_BLUETOOTH)
                val isUsb = (info.type == MidiDeviceInfo.TYPE_USB)

                deviceModels.add(MidiDeviceInfoModel(info.id, name, isUsb, isBluetooth))

                // Automatically connect and open output port (device output -> our input receiver)
                mm.openDevice(info, { device ->
                    if (device != null) {
                        openDevices.add(device)
                        for (portInfo in info.ports) {
                            if (portInfo.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT) {
                                val outputPort = device.openOutputPort(portInfo.portNumber)
                                if (outputPort != null) {
                                    openInputPorts.add(outputPort)
                                    outputPort.connect(HeraMidiReceiver())
                                    Log.i(TAG, "Connected to MIDI port: ${portInfo.name} on $name")
                                }
                            }
                        }
                    }
                }, Handler(Looper.getMainLooper()))
            }
        }

        _connectedDevices.value = deviceModels
    }

    // Set custom mapping for any hardware knob to parameter
    fun mapControlChange(cc: Int, paramId: Int) {
        ccMapping[cc] = paramId
    }

    fun getCcMapping(): Map<Int, Int> = ccMapping

    private inner class HeraMidiReceiver : MidiReceiver() {
        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            _midiActivity.value = true

            var i = offset
            while (i < offset + count) {
                val status = msg[i].toInt() and 0xFF
                if (status >= 0x80 && status < 0xF0) {
                    val command = status shr 4
                    // Note On
                    if (command == 0x9 && i + 2 < offset + count) {
                        val note = msg[i + 1].toInt() and 0x7F
                        val vel = (msg[i + 2].toInt() and 0x7F) / 127.0f
                        if (vel > 0) {
                            NativeAudioEngine.noteOn(note, vel)
                        } else {
                            NativeAudioEngine.noteOff(note)
                        }
                        i += 3
                        continue
                    }
                    // Note Off
                    if (command == 0x8 && i + 2 < offset + count) {
                        val note = msg[i + 1].toInt() and 0x7F
                        NativeAudioEngine.noteOff(note)
                        i += 3
                        continue
                    }
                    // Control Change (CC)
                    if (command == 0xB && i + 2 < offset + count) {
                        val cc = msg[i + 1].toInt() and 0x7F
                        val rawVal = msg[i + 2].toInt() and 0x7F
                        val normalizedVal = rawVal / 127.0f

                        // MIDI Learn check
                        val targetLearnParam = learningParamId
                        if (targetLearnParam != null) {
                            mapControlChange(cc, targetLearnParam)
                            learningParamId = null
                            Log.i(TAG, "MIDI Learned: CC $cc -> Param $targetLearnParam")
                        }

                        // Apply to mapped parameter
                        val targetParam = ccMapping[cc]
                        if (targetParam != null) {
                            NativeAudioEngine.setParameter(targetParam, normalizedVal)
                        }

                        // Standard All Notes Off (CC 120 / 123)
                        if (cc == 120 || cc == 123) {
                            NativeAudioEngine.allNotesOff()
                        }
                        i += 3
                        continue
                    }
                    // Pitch Bend
                    if (command == 0xE && i + 2 < offset + count) {
                        val lsb = msg[i + 1].toInt() and 0x7F
                        val msb = msg[i + 2].toInt() and 0x7F
                        val bendRaw = (msb shl 7) or lsb
                        val normalizedBend = (bendRaw - 8192) / 8192.0f
                        NativeAudioEngine.setPitchBend(normalizedBend)
                        i += 3
                        continue
                    }
                }
                i++
            }
        }
    }
}
