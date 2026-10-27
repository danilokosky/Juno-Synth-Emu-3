# Hera Juno Synthesizer (React + Web Audio)

A high-fidelity web emulation of the iconic Roland Juno-60 polyphonic analog synthesizer, rewritten from the Hera JUCE/C++ synthesizer into a modern React + TypeScript + Web Audio application.

## Features

- **6-Voice Polyphony**: Authentic 6-voice polyphonic voice allocation and voice-stealing model.
- **DCO (Digitally Controlled Oscillator)**:
  - Range switch: 16', 8', 4'
  - Waveforms: Sawtooth, Pulse with PWM (Manual, LFO, Envelope mod), Sub-oscillator (-1 octave square), Pink/White noise.
  - LFO pitch modulation depth.
- **HPF (High-Pass Filter)**:
  - 4-position stepped high-pass filter curve (Bypass, 140 Hz, 250 Hz, 520 Hz, 1220 Hz).
- **VCF (Voltage Controlled Filter)**:
  - 4-pole cascaded 24dB/oct resonant filter model with non-linear saturation.
  - Cutoff frequency, resonance with self-oscillation, bipolar envelope modulation depth (-1.0 to +1.0), LFO filter mod, keyboard tracking, and pitch bend depth.
- **VCA (Voltage Controlled Amplifier)**:
  - Gate or Envelope mode with master depth control.
- **LFO (Low Frequency Oscillator)**:
  - Rate (0.3 Hz to 22.2 Hz) and delay time controls.
  - Auto trigger and manual trigger button.
- **ADSR Envelope Generator**:
  - Classic exponential analog curves for Attack, Decay, Sustain, and Release.
- **Roland Stereo Chorus**:
  - Recreates the iconic dual-BBD analog chorus:
    - Mode I (0.513 Hz slow lush shimmer)
    - Mode II (0.863 Hz deeper modulation)
    - Mode I + II (9.75 Hz fast vibrato / rotary Leslie swirl)
- **Preset Management**:
  - Full bank of 56 original Juno-60 factory presets (Strings 1-3, Organ 1-3, Brass, Phase Brass, Piano, Celesta, Harpsichord, Bass, Clavichord, etc.).
  - Search, categorize, save custom patches to local storage, and export/import Hera XML preset files.
- **Arpeggiator**:
  - Built-in arpeggiator with Up, Down, Up/Down, and Random modes, 1-3 octave ranges, tempo sync (BPM), and note divisions.
- **Real-Time Visualizer**:
  - CRT phosphor oscilloscope displaying the audio output waveform post-VCF and Chorus.
- **Playing Controls & MIDI**:
  - Interactive multi-octave piano keyboard with QWERTY computer keyboard shortcuts and touch glissando.
  - Pitch bender lever and modulation wheel.
  - Web MIDI API integration with automatic detection of USB and Bluetooth MIDI keyboards.
  - In-browser performance recording and audio export.

## Running the App

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```
