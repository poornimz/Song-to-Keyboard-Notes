import { useEffect, useRef } from 'react';

interface MelSpectrogramCanvasProps {
  melSpec: Float32Array[] | null;
  durationSec: number;
  currentTimeSec: number;
  isPlaying: boolean;
}

// Precompute 256-step scientific colormap: slate-950 -> cobalt -> sky -> amber -> warm yellow
const COLORMAP_LUT: Uint8ClampedArray = (() => {
  const stops: Array<[number, number, number, number]> = [
    [0.0, 15, 23, 42],    // #0F172A
    [0.25, 30, 58, 138],  // #1E3A8A
    [0.5, 37, 99, 235],   // #2563EB
    [0.72, 14, 165, 233], // #0EA5E9
    [0.88, 245, 158, 11], // #F59E0B
    [1.0, 254, 240, 138], // #FEF08A
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k][0] && t <= stops[k + 1][0]) {
        s0 = stops[k];
        s1 = stops[k + 1];
        break;
      }
    }
    const span = Math.max(1e-6, s1[0] - s0[0]);
    const local = (t - s0[0]) / span;
    lut[i * 3] = Math.round(s0[1] + (s1[1] - s0[1]) * local);
    lut[i * 3 + 1] = Math.round(s0[2] + (s1[2] - s0[2]) * local);
    lut[i * 3 + 2] = Math.round(s0[3] + (s1[3] - s0[3]) * local);
  }
  return lut;
})();

export function MelSpectrogramCanvas({
  melSpec,
  durationSec,
  currentTimeSec,
  isPlaying,
}: MelSpectrogramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Build cached offscreen bitmap whenever melSpec changes
  useEffect(() => {
    if (!melSpec || melSpec.length === 0) {
      offscreenRef.current = null;
      return;
    }

    const frames = melSpec.length;
    const bins = melSpec[0].length; // 229

    // Compute robust min/max dB range for contrast
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let t = 0; t < frames; t++) {
      const col = melSpec[t];
      for (let b = 0; b < bins; b++) {
        const v = col[b];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || maxVal - minVal < 1e-4) {
      minVal = -80;
      maxVal = 0;
    }
    const range = maxVal - minVal;

    const offscreen = document.createElement('canvas');
    offscreen.width = frames;
    offscreen.height = bins;
    const octx = offscreen.getContext('2d');
    if (!octx) return;

    const imgData = octx.createImageData(frames, bins);
    const data = imgData.data;

    for (let t = 0; t < frames; t++) {
      const col = melSpec[t];
      for (let b = 0; b < bins; b++) {
        const norm = Math.max(0, Math.min(1, (col[b] - minVal) / range));
        // Gamma boost slightly so harmonics stand out clearly
        const boosted = Math.pow(norm, 0.85);
        const lutIdx = Math.min(255, Math.max(0, Math.round(boosted * 255))) * 3;
        const y = bins - 1 - b; // low frequencies at bottom, high at top
        const pixelIdx = (y * frames + t) * 4;
        data[pixelIdx] = COLORMAP_LUT[lutIdx];
        data[pixelIdx + 1] = COLORMAP_LUT[lutIdx + 1];
        data[pixelIdx + 2] = COLORMAP_LUT[lutIdx + 2];
        data[pixelIdx + 3] = 255;
      }
    }

    octx.putImageData(imgData, 0, 0);
    offscreenRef.current = offscreen;
  }, [melSpec]);

  // Draw scaled canvas + axes + playhead
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    const height = 220;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const padLeft = 52;
    const padRight = 14;
    const padTop = 12;
    const padBottom = 26;
    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    // Background
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    // Draw spectrogram bitmap
    if (offscreenRef.current) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreenRef.current, padLeft, padTop, plotW, plotH);
    } else {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(padLeft, padTop, plotW, plotH);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '12px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Load an audio file, paste a direct audio URL, or select a built-in clip to render its 229-bin Mel spectrogram.',
        padLeft + plotW / 2,
        padTop + plotH / 2
      );
    }

    // Left axis labels (Mel bins / freq)
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, padLeft - 1, height);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft - 0.5, padTop - 0.5, plotW + 1, plotH + 1);

    const yTicks: Array<{ frac: number; label: string }> = [
      { frac: 0, label: '8 kHz' },
      { frac: 0.33, label: '2.5 kHz' },
      { frac: 0.66, label: '650 Hz' },
      { frac: 1, label: '30 Hz' },
    ];
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of yTicks) {
      const y = padTop + tick.frac * plotH;
      ctx.fillText(tick.label, padLeft - 6, y);
    }

    // Bottom time axis
    const safeDur = Math.max(1, durationSec);
    const tickCount = Math.min(8, Math.max(3, Math.floor(plotW / 90)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= tickCount; i++) {
      const frac = i / tickCount;
      const x = padLeft + frac * plotW;
      const sec = frac * safeDur;
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, padTop + plotH, 1, 4);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`${sec.toFixed(1)}s`, x, padTop + plotH + 7);
    }

    // Playhead indicator
    if ((isPlaying || currentTimeSec > 0) && durationSec > 0 && offscreenRef.current) {
      const progress = Math.max(0, Math.min(1, currentTimeSec / durationSec));
      const px = padLeft + progress * plotW;
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();
    }
  }, [melSpec, durationSec, currentTimeSec, isPlaying]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-slate-800 bg-[#0F172A]">
      <canvas ref={canvasRef} className="block w-full" aria-label="229-bin Mel spectrogram" />
    </div>
  );
}
