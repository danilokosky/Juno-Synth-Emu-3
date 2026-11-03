# Diagnóstico e Plano de Restauração do Motor de Áudio v1.1 Stable

Este plano detalha a avaliação técnica comparativa entre o motor de referência **v1.1 Stable (`HeraAudioEngine.ts`)** enviado em anexo e o estado atual do projeto, identificando exatamente a origem dos cortes (dropouts), clips/estalos e diferenças de timbre, bem como as correções cirúrgicas para que o motor atue de forma idêntica à versão **1.1 Stable**.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Resultado da Auditoria do Código v1.1 Stable:**
> - Na camada **Web (`HeraAudioEngine.ts`)**, o arquivo atual é **100% idêntico byte a byte** ao arquivo `HeraAudioEngine.ts` da versão 1.1 Stable enviada no `.zip` (`56.565 bytes`, zero diferenças no `diff`).
> - Porém, no **motor nativo Android C++ (`HeraEngine.hpp` / `native-lib.cpp`)** e na **ponte de interface (`MainActivity.kt`)**, identificamos **6 divergências críticas** em relação à arquitetura da versão 1.1 Stable que causam exatamente os cortes de áudio, clips/estalos e a diferença sonora percebida.

- **Decisão Técnica 1 (Eliminação de Cortes no Áudio / Lock-Free Audio Thread)**: Substituir o `std::mutex` com `try_to_lock` dentro do callback de tempo real AAudio por uma fila atômica *Lock-Free* (SPSC Ring Buffer) para eventos de nota/arpejador e parâmetros atômicos suavizados. Hoje, sempre que a UI ou o controlador MIDI dispara uma nota no exato microssegundo em que o AAudio vai renderizar o buffer, o `try_to_lock` falha e **zera o buffer inteiro (`memset(0)`)**, gerando um corte seco e estalo audível.
- **Decisão Técnica 2 (Isolamento do Osciloscópio a 60 FPS na UI)**: Na refatoração da interface Android, o estado `waveformTick++` a cada `16ms` (60 FPS) está no escopo raiz da tela principal, forçando todos os 9 módulos, 26 faders e o teclado de 48 teclas a se recomporem 60 vezes por segundo, gerando picos de CPU e engasgos na thread principal/MIDI. O redesenho a 60 FPS será isolado exclusivamente dentro do `Canvas` do Osciloscópio.
- **Decisão Técnica 3 (Paridade Acústica e DSP 1:1 com a v1.1 Stable)**: Alinhar matematicamente a alocação de vozes Round-Robin (`softenSameNoteRelease` de `16ms`), o ciclo de gate de `70%` do Arpejador, o gerador de Ruído Rosa (Paul Kellet Pink Noise), a curva exponencial do filtro VCF (`16 Hz – 20 kHz`, `6.5` oitavas de envelope), a inversão de fase estéreo de `180°` + filtro BBD de `7.5 kHz` do Chorus e o *Master Peak Limiter* da v1.1 Stable.

---

## 1. Overview & Core Concept

- **O Que Foi Encontrado na Avaliação**:
  1. **Cortes Secos (Dropouts) por Colisão de Mutex no AAudio**: No motor C++, `renderStereo` tenta adquirir `std::unique_lock<std::mutex> lock(mutex_, std::try_to_lock)`. Quando o usuário toca acordes rápidos, usa o Arpejador ou move controles MIDI, a thread de UI/MIDI segura o `mutex_` e o callback de áudio aborta a renderização preenchendo a saída com zeros (`std::memset(outInterleaved, 0, ...)`). Isso produz um corte instantâneo (buraco na onda) seguido de um estalo.
  2. **Recomposições Globais da Interface a 60 FPS**: O loop `LaunchedEffect` que lê o buffer do osciloscópio incrementa `waveformTick++` na raiz da árvore Compose a cada `16ms`, causando recomposição completa de toda a interface a cada frame e competindo por CPU com o motor de áudio.
  3. **Falta de Suavização RC nos Parâmetros (Zipper Noise)**: Na versão 1.1 Stable, todas as mudanças de faders (`VCFCutoff`, `VCADepth`, `DCOSawLevel`, `DelayTime`, `ReverbTime`, `MasterVolume`) passam por filtros RC contínuos (`setTargetAtTime` de `5ms` a `20ms`). No motor C++, os valores mudavam em degrau seco entre blocos, gerando cliques ao movimentar faders com notas soando.
  4. **Alocação de Vozes e Arpejador Diferentes da v1.1 Stable**:
     - Na v1.1 Stable, ao repetir a mesma nota, uma **nova voz Round-Robin** é alocada enquanto a voz anterior que tocava a mesma nota recebe `softenSameNoteRelease()` (descarga suave RC de `16ms`), evitando cancelamento de fase e estalos. No C++, a mesma voz era forçada a reiniciar por cima de si mesma e o filtro `z1..z4` era zerado abruptamente ao fim do release.
     - Na v1.1 Stable, o Arpejador usa **gate de 70%** da duração do passo (`stepDuration * 0.70`), permitindo que o release do ADSR respire entre as notas. No C++, o gate ficava em 100% contínuo sem intervalo de articulação.
  5. **Diferenças Timbrais no DCO, VCF, Chorus BBD e Limiter**:
     - **Ruído**: A v1.1 usa **Pink Noise (Paul Kellet)** suave com ganho `0.12`; o C++ usava *White Noise* puro com ganho `0.35` (muito mais áspero e alto).
     - **Níveis do DCO**: Na v1.1 os ganhos pré-filtro são `Saw = 0.24`, `Pulse = 0.24`, `Sub = 0.18`, `Noise = 0.12`, mantendo headroom limpo para acordes de 6 vozes; no C++ estavam em `0.45 / 0.45 / 0.42 / 0.35`, saturando excessivamente o filtro em polifonia.
     - **Filtro VCF**: Na v1.1 a frequência base segue `16 * (20000 / 16)^VCFCutoff`, modulação de envelope de `6.5` oitavas (`VCFEnv * 6.5`), e no `noteOff` a frequência do filtro retorna suavemente para a frequência de repouso com a mesma constante de tempo do release (`releaseSec * 0.25`).
     - **Chorus BBD Roland Juno-60**: Na v1.1 o Chorus usa LFO senoidal, filtro passa-baixas BBD de `7500 Hz` em ambos os canais e **polaridade invertida em 180° no canal Direito (`-1.0`)**, com tempos e profundidades exatos para os modos `I` (`0.513 Hz`), `II` (`0.863 Hz`) e `I+II` (`1.02 Hz`).
     - **Master Peak Limiter**: Na v1.1 há um *Soft Clipper* suave (`tanh(1.2 * x) / tanh(1.2)`) pré-Chorus e um **Compressor/Limiter de Pico** (`-1.5 dB`, ataque de `1ms`, release de `120ms`) pós-Reverb que impede qualquer clip digital em acordes densos com Chorus + Delay + Reverb.

---

## 2. User Experience & Visual Design

- **Experiência Sonora Contínua e Transparente**:
  - Ao tocar acordes de 6 vozes, acionar o Arpejador em BPMs altos (`150–240 BPM`) ou mover múltiplos faders simultaneamente na tela ou via controlador MIDI, o áudio permanece 100% contínuo, sem cortes, sem estalos de retrigger e com o mesmo brilho analógico e abertura espacial estereofônica da versão **1.1 Stable**.
- **Fluidez Visual sem Interferência no Áudio**:
  - O Osciloscópio e os LEDs de vozes ativas continuam atualizando em tempo real no cabeçalho, porém confinados ao seu próprio escopo de desenho, garantindo zero impacto na latência de toque dos faders e do teclado.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Arquitetura Lock-Free por Fila de Eventos no Motor Nativo**
  - *Abordagem Escolhida*: Implementar uma fila circular atômica (*Lock-Free Ring Buffer*) para comandos `NoteOn`, `NoteOff`, `AllNotesOff`, `ManualLfoTrig` e `ArpConfig`, além de `std::atomic<float>` com suavização exponencial por amostra para os 37 parâmetros.
  - *Por quê*: Em áudio de baixa latência (AAudio `LOW_LATENCY`), a thread de áudio nunca pode disputar `std::mutex` com a thread de UI/JNI. Com fila *lock-free*, `renderStereo` nunca falha e nunca zera buffers.
- **Decisão 2: Calibração Exata dos Blocos DSP pela Referência v1.1 Stable**
  - *Abordagem Escolhida*: Reproduzir fielmente as equações, ganhos, constantes de tempo RC (`attackSec * 0.35`, `decaySec * 0.33`, `releaseSec * 0.25`, `softenSameNoteRelease` de `16ms`), filtro Pink Noise Paul Kellet, Chorus BBD com inversão de 180° + LPF de `7.5 kHz` e Master Peak Limiter da versão 1.1 Stable.
  - *Por quê*: Garante que cada preset de fábrica (`Strings 1`, `Brass 1`, `Juno Bass`, `Pad`, etc.) soe com o mesmo equilíbrio harmônico, dinâmica de filtro e imagem estéreo da versão 1.1 Stable.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        UI & MIDI Thread (Kotlin / Web)                     │
│  • Toque no Teclado / Faders / MIDI Hardware                               │
│  • Osciloscópio isolado em escopo próprio (Zero recomposição global!)      │
└───────────────────┬────────────────────────────────────┬───────────────────┘
                    │ Eventos Lock-Free (Ring Buffer)    │ Parâmetros Atômicos
                    ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                 Motor de Áudio Tempo Real (Paridade v1.1 Stable)           │
│                                                                            │
│  1. Drenagem Lock-Free de Eventos + Clock do Arpejador (Gate 70%)          │
│  2. Alocação 6 Vozes Round-Robin + softenSameNoteRelease (RC 16ms)         │
│  3. DCO Contínuo (Saw 0.24, Pulse PWM 0.24, Sub 0.18, Pink Noise 0.12)     │
│  4. VCF 4-Polos Cascaded (16Hz-20kHz, 6.5 oct Env, Descarga RC no Release) │
│  5. VCA Independente + Envelopes RC Contínuos (Sem zerar fase/filtro)      │
│  6. HPF Global + Soft Clipper (tanh(1.2x)/tanh(1.2))                       │
│  7. Stereo BBD Chorus (LPF 7.5kHz + Fase 180° Invertida no Canal R)        │
│  8. Stereo Tape Echo Delay (LPF 4.5kHz + Ping-Pong Cross-Feedback)         │
│  9. Global Post-Reverb (Pre-Delay + LowCut 135Hz + Diffusers + 6 Combs)    │
│ 10. Master Peak Limiter (-1.5dB, Attack 1ms, Release 120ms) -> Saída       │
└────────────────────────────────────────────────────────────────────────────┘
```

### Resumo das Etapas de Implementação
1. **Motor C++ Lock-Free (`HeraEngine.hpp`)**: Remover `std::mutex` do caminho de áudio (`renderStereo`, `noteOn`, `noteOff`, `setArpConfig`, `allNotesOff`), substituindo por fila circular atômica *lock-free* e parâmetros `std::atomic<float>` com suavização RC por amostra.
2. **Alocação Round-Robin, Retrigger Analógico e Arpejador 70% Gate**: Portar a lógica exata de `triggerVoiceOn` da v1.1 Stable (alocação Round-Robin entre as 6 vozes, `softenSameNoteRelease` com constante RC de `16ms` para notas repetidas, osciladores sempre rodando sem resetar fase ou zerar estados do filtro abruptamente, e gate de `70%` do passo no Arpejador).
3. **Alinhamento Timbral DCO + Pink Noise + VCF + Chorus BBD + Limiter**:
   - Substituir o ruído branco pelo gerador **Paul Kellet Pink Noise** e calibrar a mixagem do DCO (`0.24 / 0.24 / 0.18 / 0.12`).
   - Ajustar a curva do VCF (`16 Hz – 20 kHz`, `6.5` oitavas de envelope, Q suave `0.707 + res * 3.6`, retorno RC suave da frequência de corte no release).
   - Implementar no Chorus BBD os filtros passa-baixas de `7500 Hz`, LFO senoidal com as taxas/delays exatos dos modos `I`, `II` e `I+II`, e inversão de polaridade de `180°` no canal direito.
   - Adicionar o *Soft Clipper* calibrado (`tanh(1.2x) / tanh(1.2)`) e o *Master Peak Limiter* (`-1.5 dB` threshold, `1ms` attack, `120ms` release) na saída master.
4. **Otimização do Loop de 60 FPS na UI (`MainActivity.kt` e `HeraApp.tsx`)**: Isolar a atualização de 60 FPS do Osciloscópio para que ela redesenhe exclusivamente o componente do visor, eliminando recomposições globais da tela enquanto o sintetizador está tocando.
