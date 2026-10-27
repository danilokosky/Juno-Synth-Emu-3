# Hera Juno Synthesizer (React + Web Audio & Android Native C++)

A high-fidelity emulation of the iconic Roland Juno-60 polyphonic analog synthesizer, featuring both a live web interface and a complete **Android Native C++ (NDK + AAudio + Jetpack Compose)** implementation with full USB/Bluetooth MIDI hardware controller support.

---

## 📱 Android Native C++ App & GitHub Actions Compilação Automática

O projeto inclui um aplicativo nativo completo para Android na pasta `/android`:
- **Engine DSP em C++ Puro (`HeraEngine.hpp`)**: Osciladores PolyBLEP, filtro ressonante 4-pole 24dB com saturação `tanh`, envelopes ADSR, LFO e Chorus estéreo analógico.
- **Áudio Nativo AAudio de Baixíssima Latência (`native-lib.cpp`)**: Latência inferior a 10ms.
- **Suporte MIDI USB-OTG e Bluetooth LE (`MidiControllerManager.kt`)**: Detecção automática de teclados controladores e superfícies de controle externas.
- **Mapeamento Total de Knobs e Faders (CC Table + MIDI Learn)**: Todos os parâmetros do sintetizador mapeáveis via hardware.

### 🚀 Como baixar o APK diretamente pelo GitHub Actions:

1. Faça push ou acesse seu repositório no GitHub.
2. Clique na aba **Actions** no topo da página do repositório.
3. No menu à esquerda, selecione o workflow **"Build Native Android APK"**.
4. Clique no botão **"Run workflow"** (ou faça um commit no branch principal para disparar automaticamente).
5. Quando o build finalizar (cerca de 2 a 3 minutos), clique na execução concluída.
6. Na seção **Artifacts** na parte inferior da página, clique em **`Hera-Juno-Synth-Debug-APK`** para baixar o arquivo `.apk` pronto para instalar no seu celular ou tablet Android!

---

## 🎛️ Features Principais

- **Polifonia de 6 Vozes**: Alocação dinâmica com algoritmo *voice-stealing*.
- **DCO**: Range 16', 8', 4', Sawtooth anti-aliased, Pulse com PWM contínuo, Sub-oscilador onda quadrada e gerador de ruído.
- **HPF**: Filtro passa-altas com 4 posições autênticas.
- **VCF 24dB/oct**: Filtro passa-baixas em cascata de 4 polos com saturação OTA e auto-oscilação na ressonância máxima.
- **VCA & ADSR**: Curvas exponenciais para Attack, Decay, Sustain e Release ou modo instantâneo Gate.
- **Roland Stereo Chorus**: Modos I (0.513 Hz), II (0.863 Hz) e I+II (9.75 Hz rotativo/vibrato).
- **56 Presets de Fábrica**: Presets autênticos do Juno-60 (Strings, Brass, Organ, Bass, Clavinet, Piano, Pads, Leads, etc.).
- **Arpeggiator Juno**: Modos Up, Down, Up/Down, Random, 1 a 3 oitavas, sincronização de tempo (BPM) e divisões rítmicas.
- **Osciloscópio CRT**: Visualizador em tempo real da forma de onda pós-filtro e pós-chorus.

---

## 💻 Rodando o App no Navegador (Web Preview)

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
```
