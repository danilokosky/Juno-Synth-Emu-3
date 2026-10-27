package com.herajuno.synth

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.herajuno.synth.audio.NativeAudioEngine
import com.herajuno.synth.midi.MidiControllerManager
import com.herajuno.synth.ui.HeraSynthScreen

class MainActivity : ComponentActivity() {
    private lateinit var midiManager: MidiControllerManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Lock landscape for full synthesizer keyboard and panel layout
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        // Keep screen on during live performance
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Initialize Native C++ Audio Engine with AAudio
        NativeAudioEngine.initAudio(sampleRate = 48000)

        // Initialize Android USB / Bluetooth MIDI controller manager
        midiManager = MidiControllerManager(this)
        midiManager.init()

        setContent {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = Color(0xFF101216)
            ) {
                HeraSynthScreen(midiManager = midiManager)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        midiManager.scanDevices()
    }

    override fun onDestroy() {
        super.onDestroy()
        NativeAudioEngine.stopAudio()
    }
}
