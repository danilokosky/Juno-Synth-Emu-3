# Alocação Polifônica Round-Robin e Retrigger Analógico Contínuo (Juno-60)

Este plano elimina definitivamente os estalos e cortes rítmicos ("chokes") no arpejador e na repetição rápida de notas, implementando o comportamento autêntico dos 6 circuitos de voz do Roland Juno-60: alocação cíclica (*Round-Robin*) entre as 6 vozes e recarga contínua do capacitor de envelope (*Warm Retrigger*) sem derrubar o volume a zero.

## Revisão e Decisões Confirmadas

> [!IMPORTANT]
> As decisões abaixo foram confirmadas para reproduzir fielmente o comportamento elétrico do hardware analógico original, preservando 100% do timbre aprovado.

- **Decisão Confirmada 1 — Alocação de Vozes em Round-Robin**: Quando o arpejador ou o teclado repetir uma nota que ainda está na cauda de *release*, o motor alocará a próxima voz livre no ciclo de 6 vozes em vez de interromper a mesma voz que ainda está soando.
- **Decisão Confirmada 2 — Retrigger Analógico Contínuo (Sem Zerar o VCA)**: Quando uma voz em uso ou em *release* precisar ser redisparada, o envelope VCA e o filtro VCF partirão do nível atual de tensão/volume em que se encontram, subindo suavemente até o pico de ataque sem cair para zero absoluto.

---

## 1. Visão Geral e Conceito

- **O Que Faz**: Transforma o gerenciador de vozes em um autêntico alocador polifônico cíclico de 6 vozes com envelopes contínuos e osciladores persistentes durante o *retrigger*, eliminando quedas abruptas de amplitude (3 ms para zero) que geravam estalos rítmicos em presets com *Attack* e *Release* médios ou longos (como *Strings 1*).
- **Valor Principal**: Execução sedosa, contínua e livre de cliques em qualquer velocidade de BPM (88, 115, 120+ BPM) e divisão rítmica (1/8, 1/16, 1/16T), tanto com uma única nota quanto com acordes completos.

---

## 2. Experiência Sonora e Comportamento Analógico

- **Fluxo Sonoro no Arpejador**:
  1. Ao segurar uma única tecla ou acorde com o arpejador ativo, cada passo de nota aciona a próxima voz disponível no carrossel de 6 vozes (*Voice 1 → Voice 2 → ... → Voice 6*).
  2. A nota anterior continua sua curva natural de *release* (ex.: 740 ms no *Strings 1*) enquanto a nova voz inicia seu ataque, criando a sobreposição orgânica característica do Juno-60.
  3. Quando todas as 6 vozes estiverem em uso ou em cauda de *release* e uma voz precisar ser reutilizada, os osciladores dessa voz têm sua frequência atualizada suavemente e o envelope VCA retoma a subida de ataque a partir do nível atual (sem cortar a onda e sem cair a zero).
- **Indicador Visual de Vozes (Voice LEDs 1–6)**:
  - O painel superior de LEDs das 6 vozes passará a exibir o ciclo real de ativação alternando entre as vozes 1 a 6 a cada passo do arpejador, exatamente como no painel de diagnóstico do sintetizador clássico.

---

## 3. Decisões Técnicas e Racional

- **Decisão 1: Alocador Polifônico Round-Robin de 6 Vozes**
  - *Abordagem Escolhida*: Manter um ponteiro cíclico (`lastAllocatedVoiceIndex`) que percorre as 6 vozes priorizando: (1) a próxima voz totalmente inativa no ciclo; (2) a próxima voz em fase de *release* mais antiga; (3) a voz ativa mais antiga caso todas as 6 estejam sustentadas.
  - *Por Quê*: Impede que uma única nota repetida no arpejador sufoque sua própria cauda de *release* quando há 5 outras vozes ociosas.
- **Decisão 2: Warm Retrigger com Reaproveitamento de Osciladores Ativos**
  - *Abordagem Escolhida*: Se a voz selecionada já possui osciladores rodando em fase de *release*, não destruí-los nem zerar o `envGain`; em vez disso, atualizar a frequência/detune dos osciladores ativos na thread de áudio, congelar o ganho atual com `cancelAndHoldAtTime(t)` e agendar a rampa de ataque diretamente do valor atual até o `voiceVolume`.
  - *Por Quê*: Evita tanto a descontinuidade de fase de parar/recriar osciladores quanto o corte abrupto de amplitude de 3 ms para zero que causava o efeito de estalo ("wah-TUCK").

---

## 4. Arquitetura Técnica e Estratégia de Áudio

### Diagrama do Ciclo de Alocação e Retrigger

```
┌──────────────────────────────────────────────────────────────────────┐
│                   Teclado / Clock do Arpejador                       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ triggerVoiceOn(note, velocity)
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│             Alocador Polifônico Round-Robin (6 Vozes)                │
│  1. Busca próxima voz livre (!active) a partir do índice atual       │
│  2. Se todas ativas, busca voz em Release (released = true) mais     │
│     antiga para sobreposição suave                                   │
│  3. Se todas sustentadas, seleciona a voz mais antiga                │
└──────────────────┬───────────────────────────────┬───────────────────┘
                   │ Voz Inativa (Silêncio)        │ Voz Já Soando (Warm Retrigger)
                   ▼                               ▼
┌──────────────────────────────────┐ ┌─────────────────────────────────┐
│     Cold Start (A partir de 0)   │ │    Warm Analog Retrigger        │
│ • Cria/inicia osciladores em t   │ │ • Mantém osciladores rodando    │
│ • envGain parte de 0.0           │ │   e atualiza frequência em t    │
│ • Sobe rampa de Attack até       │ │ • cancelAndHoldAtTime(t) no VCA │
│   voiceVolume sem estalo         │ │   e no filtro VCF               │
│                                  │ │ • Sobe Attack a partir do       │
│                                  │ │   volume atual sem cair a zero  │
└──────────────────────────────────┘ └─────────────────────────────────┘
```

### Mapeamento de Estado e Transições

- **Controle de Nota Solta (`triggerVoiceOff`)**: Ao receber o evento de soltar uma nota (`noteOff`), o motor libera as vozes ativas correspondentes àquela nota que ainda não entraram em *release*, garantindo que cada passo do arpejador cumpra seu ciclo completo de *Attack → Decay → Sustain → Release*.
- **Proteção de Limiter e Headroom**: Como até 6 vozes podem sobrepor suas caudas de *release* suavemente em arpejos rápidos, o ganho individual das vozes e o *soft clipper* analógico mantêm a soma polifônica limpa e sem saturação digital.
