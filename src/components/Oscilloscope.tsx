import React, { useEffect, useRef } from 'react';
import { synthEngine } from '../audio/HeraAudioEngine';

interface OscilloscopeProps {
  className?: string;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = synthEngine.getAnalyser();

    const render = () => {
      animId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      // Dark CRT phosphor background
      ctx.fillStyle = '#080d0d';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#122622';
      ctx.lineWidth = 1;

      // Horizontal grid
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      // Vertical grid
      for (let x = 0; x < width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Center baseline
      ctx.strokeStyle = '#1c4238';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const liveAnalyser = synthEngine.getAnalyser();
      if (!liveAnalyser) {
        // Flat line
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      const bufferLength = liveAnalyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      liveAnalyser.getByteTimeDomainData(dataArray);

      // Oscilloscope trace glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#10b981';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className={`relative rounded border border-emerald-900/60 overflow-hidden shadow-inner ${className}`}>
      <canvas
        ref={canvasRef}
        width={240}
        height={86}
        className="w-full h-full block"
      />
      <div className="absolute top-1 left-2 text-[9px] font-mono text-emerald-500/80 uppercase tracking-widest pointer-events-none">
        Oscilloscope
      </div>
    </div>
  );
};
