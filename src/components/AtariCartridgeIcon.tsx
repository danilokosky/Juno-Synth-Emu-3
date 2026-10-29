import React from 'react';

interface AtariCartridgeIconProps {
  className?: string;
  size?: number | string;
}

export const AtariCartridgeIcon: React.FC<AtariCartridgeIconProps> = ({
  className = 'w-9 h-9 sm:w-10 sm:h-10',
  size,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      role="img"
      aria-label="Hera Juno Synthesizer Atari Cartridge Icon"
    >
      <defs>
        {/* Faded sun gradient (sun-bleached 80s warmth) */}
        <linearGradient id="atariFadedSun" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#f97316" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#ec4899" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.8" />
        </linearGradient>

        {/* Synthwave twilight sky gradient */}
        <linearGradient id="atariTwilightSky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0f1026" />
          <stop offset="45%" stopColor="#2a1645" />
          <stop offset="75%" stopColor="#4c1d56" />
          <stop offset="100%" stopColor="#18132b" />
        </linearGradient>

        {/* Perspective grid gradient */}
        <linearGradient id="atariGridGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
        </linearGradient>

        {/* Walnut wood cheek texture */}
        <linearGradient id="atariWoodCheekLeft" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3f1e10" />
          <stop offset="50%" stopColor="#6c3319" />
          <stop offset="100%" stopColor="#451e0e" />
        </linearGradient>

        <linearGradient id="atariWoodCheekRight" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#451e0e" />
          <stop offset="50%" stopColor="#6c3319" />
          <stop offset="100%" stopColor="#3f1e10" />
        </linearGradient>

        {/* Cartridge label frame gradient */}
        <linearGradient id="atariCartridgeFrame" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22252c" />
          <stop offset="100%" stopColor="#14161b" />
        </linearGradient>
      </defs>

      {/* ATARI CARTRIDGE OUTER BODY (Matte Textured Plastic Shell) */}
      <rect x="0" y="0" width="512" height="512" rx="42" fill="#15171c" />

      {/* Outer Beveled Groove of Cartridge */}
      <rect x="14" y="14" width="484" height="484" rx="32" fill="none" stroke="#2c303a" strokeWidth="3" />
      <rect x="22" y="22" width="468" height="468" rx="26" fill="url(#atariCartridgeFrame)" />

      {/* CARTRIDGE LABEL INSET */}
      <g>
        {/* Label Background */}
        <rect x="34" y="34" width="444" height="444" rx="20" fill="#181a20" stroke="#3b3f4c" strokeWidth="2" />

        {/* TOP ATARI STYLE HEADER STRIP */}
        <rect x="36" y="36" width="440" height="44" rx="18" fill="#101216" />
        <text x="56" y="63" fontFamily="'Courier New', Courier, monospace" fontSize="11" fontWeight="900" fill="#9ca3af" letterSpacing="3">
          CX-1982 • STEREO AUDIO
        </text>
        <text x="456" y="63" fontFamily="'Courier New', Courier, monospace" fontSize="11" fontWeight="900" fill="#9ca3af" textAnchor="end" letterSpacing="2">
          6 VOICES
        </text>

        {/* MAIN ARTWORK DISPLAY WINDOW */}
        <g transform="translate(48, 86)">
          <rect x="0" y="0" width="416" height="268" rx="10" fill="url(#atariTwilightSky)" stroke="#383d4a" strokeWidth="2" />

          {/* Retro Neon Grid Horizon */}
          <polygon points="0,172 70,140 140,165 210,130 280,162 350,135 416,168 416,268 0,268" fill="#150f28" opacity="0.9" />

          {/* Retrowave Faded Sun */}
          <circle cx="208" cy="120" r="68" fill="url(#atariFadedSun)" />

          {/* Sun Horizon Scanlines */}
          <line x1="140" y1="110" x2="276" y2="110" stroke="#2a1645" strokeWidth="2.5" />
          <line x1="140" y1="120" x2="276" y2="120" stroke="#2a1645" strokeWidth="3" />
          <line x1="142" y1="131" x2="274" y2="131" stroke="#37174b" strokeWidth="4" />
          <line x1="146" y1="143" x2="270" y2="143" stroke="#4c1d56" strokeWidth="5" />
          <line x1="152" y1="156" x2="264" y2="156" stroke="#4c1d56" strokeWidth="6" />
          <line x1="162" y1="170" x2="254" y2="170" stroke="#18132b" strokeWidth="7" />

          {/* Perspective Grid Lines */}
          <line x1="0" y1="185" x2="416" y2="185" stroke="#06b6d4" strokeWidth="1.2" opacity="0.6" />
          <line x1="0" y1="202" x2="416" y2="202" stroke="#06b6d4" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1="224" x2="416" y2="224" stroke="#06b6d4" strokeWidth="2" opacity="0.8" />
          <line x1="0" y1="250" x2="416" y2="250" stroke="#06b6d4" strokeWidth="2.5" opacity="0.9" />

          {/* Vanishing Perspective Lines */}
          <line x1="208" y1="172" x2="-40" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.5" />
          <line x1="208" y1="172" x2="40" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.5" />
          <line x1="208" y1="172" x2="110" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.5" />
          <line x1="208" y1="172" x2="170" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.8" />
          <line x1="208" y1="172" x2="208" y2="268" stroke="url(#atariGridGrad)" strokeWidth="2" />
          <line x1="208" y1="172" x2="246" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.8" />
          <line x1="208" y1="172" x2="306" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.5" />
          <line x1="208" y1="172" x2="376" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.5" />
          <line x1="208" y1="172" x2="456" y2="268" stroke="url(#atariGridGrad)" strokeWidth="1.5" />

          {/* FLOATING ROLAND JUNO SYNTHESIZER HERO */}
          <g transform="translate(48, 142)">
            <polygon points="12,106 308,106 324,118 -4,118" fill="#000000" opacity="0.6" />

            {/* Wood Cheeks */}
            <polygon points="6,24 22,12 22,96 6,104" fill="url(#atariWoodCheekLeft)" stroke="#221008" strokeWidth="1" />
            <polygon points="298,12 314,24 314,104 298,96" fill="url(#atariWoodCheekRight)" stroke="#221008" strokeWidth="1" />

            {/* Main Metal Chassis */}
            <polygon points="22,12 298,12 298,68 22,68" fill="#18191f" stroke="#2c2f38" strokeWidth="1.5" />

            {/* JUNO RAINBOW COLOR ACCENT STRIPES */}
            <polygon points="22,12 298,12 298,15 22,15" fill="#e11d48" />
            <polygon points="22,15 298,15 298,18 22,18" fill="#f97316" />
            <polygon points="22,18 298,18 298,21 22,21" fill="#eab308" />
            <polygon points="22,21 298,21 298,24 22,24" fill="#06b6d4" />
            <polygon points="22,24 298,24 298,27 22,27" fill="#2563eb" />

            {/* Slider Silhouettes */}
            <line x1="45" y1="36" x2="45" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="42" y="42" width="6" height="4" rx="1" fill="#f59e0b" />

            <line x1="65" y1="36" x2="65" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="62" y="48" width="6" height="4" rx="1" fill="#f59e0b" />

            <line x1="100" y1="36" x2="100" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="97" y="38" width="6" height="4" rx="1" fill="#ef4444" />

            <line x1="120" y1="36" x2="120" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="117" y="46" width="6" height="4" rx="1" fill="#ef4444" />

            <line x1="160" y1="36" x2="160" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="157" y="40" width="6" height="4" rx="1" fill="#06b6d4" />

            <line x1="180" y1="36" x2="180" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="177" y="50" width="6" height="4" rx="1" fill="#06b6d4" />

            <line x1="220" y1="36" x2="220" y2="56" stroke="#4b5563" strokeWidth="2" />
            <rect x="217" y="44" width="6" height="4" rx="1" fill="#f97316" />

            {/* Chorus Buttons */}
            <rect x="256" y="40" width="10" height="7" rx="1" fill="#ec4899" stroke="#fda4af" strokeWidth="0.8" />
            <rect x="272" y="40" width="10" height="7" rx="1" fill="#ec4899" stroke="#fda4af" strokeWidth="0.8" />

            {/* Keyboard Bed */}
            <polygon points="22,68 298,68 298,96 22,96" fill="#1c1d22" stroke="#2c2f38" strokeWidth="1" />

            {/* White Keys */}
            <g fill="#f3f0e6" stroke="#333742" strokeWidth="0.8">
              <rect x="26" y="68" width="10.8" height="26" />
              <rect x="37" y="68" width="10.8" height="26" />
              <rect x="48" y="68" width="10.8" height="26" />
              <rect x="59" y="68" width="10.8" height="26" />
              <rect x="70" y="68" width="10.8" height="26" />
              <rect x="81" y="68" width="10.8" height="26" />
              <rect x="92" y="68" width="10.8" height="26" />
              <rect x="103" y="68" width="10.8" height="26" />
              <rect x="114" y="68" width="10.8" height="26" />
              <rect x="125" y="68" width="10.8" height="26" />
              <rect x="136" y="68" width="10.8" height="26" />
              <rect x="147" y="68" width="10.8" height="26" />
              <rect x="158" y="68" width="10.8" height="26" />
              <rect x="169" y="68" width="10.8" height="26" />
              <rect x="180" y="68" width="10.8" height="26" />
              <rect x="191" y="68" width="10.8" height="26" />
              <rect x="202" y="68" width="10.8" height="26" />
              <rect x="213" y="68" width="10.8" height="26" />
              <rect x="224" y="68" width="10.8" height="26" />
              <rect x="235" y="68" width="10.8" height="26" />
              <rect x="246" y="68" width="10.8" height="26" />
              <rect x="257" y="68" width="10.8" height="26" />
              <rect x="268" y="68" width="10.8" height="26" />
              <rect x="279" y="68" width="10.8" height="26" />
            </g>

            {/* Black Keys */}
            <g fill="#18181c">
              <rect x="33" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="45" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="67" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="79" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="91" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="110" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="122" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="144" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="156" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="168" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="187" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="199" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="221" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="233" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="245" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="264" y="68" width="6.5" height="16" rx="0.5" />
              <rect x="276" y="68" width="6.5" height="16" rx="0.5" />
            </g>
          </g>

          {/* Waveforms Arc */}
          <path d="M10,95 L40,95 L40,55 L70,55 L70,95 L100,95 L100,55 L130,55" fill="none" stroke="#f43f5e" strokeWidth="2" opacity="0.75" />
          <path d="M285,95 L315,55 L315,95 L345,55 L345,95 L375,55 L375,95 L405,55" fill="none" stroke="#06b6d4" strokeWidth="2" opacity="0.75" />
        </g>

        {/* LOWER ATARI TITLE PLATE */}
        <g transform="translate(48, 366)">
          <rect x="0" y="0" width="83.2" height="5" fill="#e11d48" />
          <rect x="83.2" y="0" width="83.2" height="5" fill="#ea580c" />
          <rect x="96.4" y="0" width="83.2" height="5" fill="#eab308" />
          <rect x="249.6" y="0" width="83.2" height="5" fill="#06b6d4" />
          <rect x="332.8" y="0" width="83.2" height="5" fill="#2563eb" />
        </g>

        <text x="256" y="410" fontFamily="'Impact', 'Arial Black', sans-serif" fontSize="34" fontWeight="900" fill="#f4eedb" textAnchor="middle" letterSpacing="8">
          HERA
        </text>

        <text x="256" y="432" fontFamily="'Courier New', Courier, monospace" fontSize="12" fontWeight="900" fill="#f59e0b" textAnchor="middle" letterSpacing="4">
          JUNO-60 • JUNO-106
        </text>

        <text x="256" y="456" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fontSize="9" fontWeight="700" fill="#71717a" textAnchor="middle" letterSpacing="2">
          6-VOICE POLYPHONIC ANALOG SYNTHESIZER
        </text>
      </g>
    </svg>
  );
};
