package com.herajuno.synth.audio

object NativeAudioEngine {
    init {
        System.loadLibrary("herajuno")
    }

    external fun initAudio(sampleRate: Int = 48000): Boolean
    external fun stopAudio()
    external fun noteOn(note: Int, velocity: Float)
    external fun noteOff(note: Int)
    external fun allNotesOff()
    external fun setPitchBend(normalized: Float)
    external fun setModWheel(normalized: Float)
    external fun setParameter(paramId: Int, value: Float)
}
