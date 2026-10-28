export interface HeraParameters {
  // DCO
  DCORange: number;          // 0: 16', 1: 8', 2: 4'
  LFOTrigMode: number;       // 0: Manual, 1: Auto
  DCOPWMMod: number;         // 0: Manual, 1: LFO, 2: Envelope
  DCOPitchModDepth: number;  // 0.0 - 1.0 (LFO pitch mod)
  DCOPWMDepth: number;       // 0.0 - 1.0
  DCOPulseLevel: number;     // 0.0 - 1.0
  DCOSawLevel: number;       // 0.0 - 1.0
  DCOSubLevel: number;       // 0.0 - 1.0
  DCONoiseLevel: number;     // 0.0 - 1.0

  // HPF
  HPF: number;               // 0.0 - 1.0 (4 positions: flat, 225Hz, 520Hz, 1220Hz)

  // VCF
  VCFCutoff: number;         // 0.0 - 1.0
  VCFResonance: number;      // 0.0 - 1.0
  VCFEnv: number;            // -1.0 - 1.0 (Bipolar envelope mod depth)
  VCFLFO: number;            // 0.0 - 1.0
  VCFKey: number;            // 0.0 - 1.0 (Keyboard tracking)
  VCFBendDepth: number;      // 0.0 - 1.0

  // LFO
  LFORate: number;           // 0.0 - 1.0 (0.3Hz - 22Hz)
  LFODelay: number;          // 0.0 - 1.0 (0.0s - 2.7s)

  // VCA
  VCAType: number;           // 0: Envelope, 1: Gate
  VCADepth: number;          // 0.0 - 1.0

  // Envelope
  ENVAttack: number;         // 0.0 - 1.0 (1ms - 3.25s)
  ENVDecay: number;          // 0.0 - 1.0 (2ms - 20s)
  ENVSustain: number;        // 0.0 - 1.0
  ENVRelease: number;        // 0.0 - 1.0 (2ms - 20s)

  // Chorus
  ChorusI: number;           // 0 or 1
  ChorusII: number;          // 0 or 1
}

export const DEFAULT_PARAMETERS: HeraParameters = {
  DCORange: 1, // 8'
  LFOTrigMode: 1, // Auto
  DCOPWMMod: 1, // LFO
  DCOPitchModDepth: 0.2, // Default audible musical vibrato
  DCOPWMDepth: 0.2,
  DCOPulseLevel: 0.0,
  DCOSawLevel: 1.0,
  DCOSubLevel: 0.0,
  DCONoiseLevel: 0.0,

  HPF: 0.0,

  VCFCutoff: 0.7,
  VCFResonance: 0.0,
  VCFEnv: 0.0,
  VCFLFO: 0.0,
  VCFKey: 1.0,
  VCFBendDepth: 0.0,

  LFORate: 0.5,
  LFODelay: 0.0,

  VCAType: 0, // Envelope
  VCADepth: 0.6,

  ENVAttack: 0.35,
  ENVDecay: 0.1,
  ENVSustain: 1.0,
  ENVRelease: 0.45,

  ChorusI: 1,
  ChorusII: 0,
};

export interface VoiceStatus {
  id: number;
  note: number;
  freq: number;
  active: boolean;
  startTime: number;
}
