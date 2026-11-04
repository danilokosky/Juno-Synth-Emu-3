# 🎹 HERA Juno-60 Polyphonic Synthesizer
### Emulador de Alta Fidelidade (Android Nativo C++ NDK/AAudio & Web Audio API)

O **HERA Juno-60** é uma recriação completa e de baixíssima latência do lendário sintetizador analógico polifônico **Roland Juno-60 (1982)**, expandido com um rack de efeitos integrado (**Chorus BBD Estéreo**, **Echo Delay** e **Reverb Global**) e um sistema avançado de controle e mapeamento **MIDI Hardware** para performances ao vivo.

O projeto conta com duas implementações sincronizadas no mesmo repositório:
1. **Android Nativo (`/android`)**: Engine DSP escrita em **C++17 puro**, áudio em tempo real via **AAudio (NDK)** com latência ultrabaixa (< 10ms), interface em **Jetpack Compose** e suporte nativo a **MIDI USB-OTG e Bluetooth LE**.
2. **Web Application (`/src`)**: Interface interativa em **React + TypeScript + Tailwind CSS** com motor de síntese polifônico em **Web Audio API** e suporte completo à **Web MIDI API**.

---

## ✨ Principais Recursos

### 🔊 Motor de Síntese Analógica Virtual (6 Vozes Polifônicas)
- **Polifonia de 6 Vozes**: Alocação dinâmica de vozes com algoritmo inteligente de *voice-stealing* e indicadores luminosos de atividade por voz no painel superior.
- **LFO (Modulator)**: Controle de velocidade (*Rate*), tempo de atraso (*Vib Delay*), modo de disparo (`MAN` / `AUTO`) e botão dedicado **`MAN TRIG`** para disparo manual do vibrato/modulação.
- **DCO (Digitally Controlled Oscillator)**:
  - Seletores de oitava autênticos **`16'`**, **`8'`** e **`4'`**.
  - Formas de onda **Sawtooth** (Dente de Serra) e **Pulse** com anti-aliasing via algoritmo **PolyBLEP**.
  - **PWM (Pulse Width Modulation)** contínuo com chave seletora de 3 modos: **`MAN`** (largura de pulso manual), **`LFO`** (modulado pelo LFO) e **`ENV`** (modulado pelo envelope ADSR).
  - **Sub-Oscilador** em onda quadrada (1 oitava abaixo) com fader de volume dedicado.
  - **Gerador de Ruído (Noise)** analógico para timbres percussivos, sopros e ambiências.
- **HPF (High-Pass Filter)**: Filtro passa-altas de 4 estágios (posições `0` a `3`), incluindo o clássico reforço de graves (*bass boost*) na posição `0`.
- **VCF (Voltage Controlled Filter — 24dB/oct OTA)**:
  - Filtro passa-baixas ressonante de 4 polos em cascata com saturação não-linear (`tanh`) e auto-oscilação em ressonância máxima.
  - Modulação por envelope com chave de polaridade (**Normal / Invertida**).
  - Controles independentes de modulação por **ENV**, **LFO**, **KYBD** (*Keyboard Tracking*) e **BEND** (*Pitch Bend* no filtro).
- **VCA & Envelope ADSR**:
  - Chave seletora de modo do amplificador: **`ENV`** (controlado pelo ADSR) ou **`GATE`** (ataque e corte instantâneos estilo órgão).
  - Fader de ajuste fino de ganho por patch (**VCA Level**) e gerador de envelope **Attack, Decay, Sustain, Release** com curvas exponenciais musicais.
- **Rack de Efeitos Estéreo Integrado**:
  - **Stereo BBD Chorus**: Emulação fiel do clássico circuito *Bucket-Brigade Device* do Juno-60 com modos **`I`** (suave), **`II`** (profundo) e **`I+II`** (vibrato rotativo) + fader de **Rate**.
  - **Echo Delay**: Delay estéreo sincronizável com controles de **Time**, **Feedback** e **Mix**.
  - **Reverb Global**: Reverb estéreo de alta densidade com controles de **Size**, **Damp** e **Mix**.

---

## 🎛️ Sistema MIDI Avançado para Performance ao Vivo

O HERA Juno-60 foi projetado para integração imediata com teclados controladores e superfícies MIDI externas (USB-OTG, Bluetooth MIDI ou interface DIN-MIDI):

### 1. Canais MIDI Independentes por Seção (`CANAIS`)
Cada módulo do sintetizador pode operar em **`OMNI`** (todos os canais) ou em um canal exclusivo (**`CH 01`** a **`CH 16`**), permitindo dividir seu controlador em zonas ou bancos de faders independentes:
- **Teclas & Volume Master** (Notas, Pitch Bend, Mod Wheel, Master Volume)
- **LFO (Vibrato)**
- **DCO / VCO (Oscilador)**
- **HPF (Filtro Passa-Alta)**
- **VCF (Filtro Principal)**
- **VCA (Amplificador)**
- **ENV (Envelope ADSR)**
- **Chorus BBD**
- **Echo Delay**
- **Reverb Global**
- **Arpejador & Presets**

### 2. Perfil Nativo para Novation Launchkey MK4 & Gerenciador de Perfis
- **Perfil de Fábrica `Launchkey MK4`**: Já vem pré-configurado com o roteamento multi-canal e mapeamentos prontos para uso:
  - **`CH 01`**: Seção LFO
  - **`CH 02`**: Teclas & Master, DCO (CCs 1, 20, 21, 22, 23, Range, LFO Trig, PWM Mode), VCA e ENV
  - **`CH 06`**: HPF, VCF (CC 2), Chorus BBD, Echo Delay, Reverb Global e Arpejador & Presets
  - **Troca de Presets**: Mapeada por padrão em **Program Change `PC 115` (`PRESET -`)** e **`PC 114` (`PRESET +`)**.
  - **Rodas de Expressão**: **Pitch Bend** e **Modulation Wheel (`CC 1`)** mapeadas e reativas na tela.
- **Múltiplos Perfis**: Crie novos perfis personalizados para diferentes teclados controladores, alterne entre eles com um toque e restaure o padrão de fábrica quando desejar.

### 3. MIDI Learn Completo (Faders, Botões, Seletores de 3 Vias e Rodas)
- Ative o botão **`MIDI LEARN`** no topo da tela, toque em qualquer controle da interface (fader, botão de switch, seletor de 3 posições como `RANGE` / `PWM`, botões de navegação de presets ou rodas de **Pitch** e **Mod**) e mova o controle físico no seu teclado para vinculá-lo instantaneamente.
- **Mudança de Presets Flexível**: No menu `CANAIS`, escolha entre:
  - **Program Change (`PC 0..127`)**: Seleciona diretamente os timbres ou dispara avançar/voltar preset via comandos `PC` (respeitando o canal específico mapeado no botão ou o canal da seção).
  - **Custom Program**: Permite usar botões `CC`, `Note` ou `PC` dedicados para avançar (`PRESET +`) e retroceder (`PRESET -`) na lista de timbres.

### 4. Projeção Ao Vivo da Seção em Pop-up (*Live Section Projection*)
- **Foco Visual Instantâneo**: Ao mover qualquer fader, knob ou switch **mapeado** no seu controlador MIDI físico, a seção inteira que está sendo alterada (`LFO`, `DCO`, `HPF`, `VCF`, `VCA`, `ENV`, `CHORUS`, `DELAY` ou `REVERB`) é projetada automaticamente em um **pop-up centralizado** na tela, mantendo exatamente a proporção e o zoom atuais do painel, destacada por uma sutil auréola dourada.
- **Temporização Inteligente**: O pop-up aparece imediatamente no primeiro movimento, permanece visível por **1,5 segundo** após você soltar o controle e desaparece com um *fade-out* suave sem piscar.
- **Filtros de Segurança**:
  - Controles físicos **não mapeados** no controlador são ignorados pelo pop-up (não poluem a tela).
  - A projeção é automaticamente inibida enquanto o modo **`MIDI LEARN`** estiver ativo para facilitar o mapeamento.
  - Pode ser ativada ou desativada a qualquer momento no menu **`CANAIS` -> `PROJEÇÃO DE SEÇÃO EM POP-UP`**.

---

## 💾 56 Presets de Fábrica, Bancos de Usuário & Exportação XML

- **56 Timbres Clássicos**: Inclui a biblioteca completa de patches inspirados no Juno-60 original (*Strings 1 & 2, Brass 1–3, Chorus Funk, Synth Bass, Organ, Clavinet, Electric Piano, Flute, Chimes, Pad Sweep, Hollow Lead*, entre outros).
- **Salvar & Organizar**: Salve seus próprios timbres na memória interna do aplicativo.
- **Exportação e Importação `.XML` / `.HERA`**: Exporte seus patches para arquivos XML ou carregue presets externos para compartilhar entre dispositivos Android e a versão Web.

---

## 🎹 Teclado Polifônico, Arpejador & Painel Responsivo

- **Teclado de 61 Teclas**:
  - **Android**: Suporte multi-touch real com detecção de *glissando* (deslizar o dedo pelas teclas brancas e pretas sem levantar) e trava de sustentação (**`HOLD`**).
  - **Web / Desktop**: Suporte a clique/arrasto do mouse e atalhos no teclado do computador (**QWERTY** em duas oitavas simultâneas).
- **Arpejador Juno Clássico**:
  - Modos **`UP`**, **`DOWN`**, **`UP & DOWN`** e **`RANDOM`**.
  - Alcance de **1 a 4 oitavas**, controle de andamento (**BPM**) e divisões rítmicas (**`1/4`**, **`1/8`**, **`1/8T`**, **`1/16`**).
- **Painel Dinâmico & Osciloscópio CRT**:
  - Oculte o teclado virtual ou o arpejador a qualquer momento pelos botões **`TECLADO`** e **`ARP`** para que os módulos de faders se expandam automaticamente na vertical, aumentando a precisão do toque em telas menores.
  - **Osciloscópio CRT** integrado na barra superior exibindo a forma de onda resultante em tempo real.

---

## 📲 Como Baixar e Instalar no Android (`.APK`)

### Opção 1: Pela aba Actions do GitHub (Build Automático)
1. No topo deste repositório no GitHub, clique na aba **[Actions](../../actions)**.
2. No menu lateral esquerdo, selecione o workflow **"Build Native Android APK (Kotlin + C++ NDK)"**.
3. Clique na execução mais recente concluída com sucesso (ícone verde ✅) ou clique em **"Run workflow"** para gerar uma nova compilação.
4. Role até o final da página na seção **Artifacts** e baixe o pacote:
   - **`Hera-Juno-Synth-Debug-APK`** (ou `Release-APK`).
5. Extraia o arquivo `.zip` baixado e instale o `.apk` no seu smartphone ou tablet Android (Android 8.0 / API 26 ou superior).

### Opção 2: Compilando Localmente no Android Studio
1. Clone o repositório:
   ```bash
   git clone https://github.com/danilokosky/Juno-Synth-Emu-3.git
   ```
2. Abra a pasta **`android/`** no **Android Studio** (certifique-se de ter o **NDK** e o **CMake** instalados via *SDK Manager -> SDK Tools*).
3. Conecte seu dispositivo Android ou inicie um emulador e clique em **Run (`Shift + F10`)**, ou execute via terminal:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
4. O APK compilado estará disponível em `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 💻 Como Rodar a Versão Web no Computador

### Pré-requisitos
- **Node.js** 18+ e **npm** instalados.

### Passo a Passo
1. Instale as dependências na raiz do projeto:
   ```bash
   npm install
   ```
2. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:3000` no navegador (recomendado **Google Chrome**, **Edge** ou **Brave** para suporte completo à **Web MIDI API** ao conectar seu controlador USB).

Para gerar o build otimizado de produção da versão Web:
```bash
npm run build
```

---

## 🗂️ Estrutura do Projeto

```text
├── android/                         # Aplicativo Android Nativo (Kotlin + Jetpack Compose + C++ NDK)
│   └── app/src/main/
│       ├── cpp/
│       │   ├── HeraEngine.hpp       # Motor DSP C++17 (6 vozes PolyBLEP, VCF 24dB, ADSR, Chorus BBD, Delay, Reverb)
│       │   ├── native-lib.cpp       # Bridge JNI + Callback de áudio AAudio de baixa latência
│       │   └── CMakeLists.txt       # Configuração de compilação nativa C++17 (-O3 -ffast-math)
│       └── java/com/hera/juno/
│           ├── MainActivity.kt      # Interface Jetpack Compose, Rack, Pop-up de Projeção, Modais e Teclado Multi-Touch
│           ├── MidiControllerManager.kt # Gerenciador MIDI USB/BLE, Canais por Seção, MIDI Learn e Perfil Launchkey MK4
│           ├── PresetBank.kt        # 56 Presets de Fábrica + Importação/Exportação XML
│           └── NativeSynthBridge.kt # Interface Kotlin <-> C++ JNI
├── src/                             # Aplicativo Web (React 19 + TypeScript + Tailwind CSS + Web Audio API)
│   ├── audio/                       # Engine DSP Web Audio, Vozes, Chorus BBD, Delay, Reverb e Gerenciador Web MIDI
│   ├── components/                  # Interface completa do sintetizador (HeraApp, Faders, Osciloscópio, Teclado)
│   └── types/                       # Definições de parâmetros, canais por seção e perfis MIDI
└── .github/workflows/               # Pipeline CI/CD para compilação automática do APK Android (NDK + Gradle)
```

---

## 📄 Licença

Desenvolvido para músicos, sound designers e entusiastas de sintetizadores clássicos. Sinta-se à vontade para explorar o código, abrir *Issues* ou enviar *Pull Requests*!
