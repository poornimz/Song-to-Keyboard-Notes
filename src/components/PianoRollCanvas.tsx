import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteEvent } from '../types/notebook';
import {
  KEYBOARD_MAX_MIDI,
  KEYBOARD_MIN_MIDI,
  isBlackKey,
  midiToNoteName,
} from '../utils/musicTheory';

interface PianoRollCanvasProps {
  notes: NoteEvent[];
  durationSec: number;
  currentTimeSec: number;
  isPlaying: boolean;
  onSeek: (timeSec: number) => void;
}

interface HoveredNoteInfo {
  note: NoteEvent;
  x: number;
  y: number;
}

export function PianoRollCanvas({
  notes,
  durationSec,
  currentTimeSec,
  isPlaying,
  onSeek,
}: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<HoveredNoteInfo | null>(null);

  const pitchSpan = KEYBOARD_MAX_MIDI - KEYBOARD_MIN_MIDI + 1; // 61 keys (C2..C7)
  const padLeft = 38;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 24;
  const canvasHeight = 330;

  const drawRoll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(canvasHeight * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, canvasHeight - padTop - padBottom);
    const rowH = plotH / pitchSpan;
    const safeDur = Math.max(1, durationSec);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, canvasHeight);

    // Draw horizontal pitch lanes (C7 at top, C2 at bottom)
    for (let midi = KEYBOARD_MIN_MIDI; midi <= KEYBOARD_MAX_MIDI; midi++) {
      const rowFromTop = KEYBOARD_MAX_MIDI - midi;
      const y = padTop + rowFromTop * rowH;
      const black = isBlackKey(midi);
      ctx.fillStyle = black ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(padLeft, y, plotW, rowH);

      // C octave dividers + labels
      if (midi % 12 === 0) {
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, y + rowH);
        ctx.lineTo(padLeft + plotW, y + rowH);
        ctx.stroke();

        ctx.fillStyle = '#64748B';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(midiToNoteName(midi), padLeft - 6, y + rowH / 2);
      }
    }

    // Vertical time grid lines
    const secStep =
      safeDur <= 8
        ? 1
        : safeDur <= 16
          ? 2
          : safeDur <= 35
            ? 5
            : safeDur <= 75
              ? 10
              : 15;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= safeDur; s += secStep) {
      const x = padLeft + (s / safeDur) * plotW;
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.fillText(`${s}s`, x, padTop + plotH + 6);
    }

    // Plot border
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft + 0.5, padTop + 0.5, plotW - 1, plotH - 1);

    // Draw notes
    for (const note of notes) {
      const clampedPitch = Math.max(KEYBOARD_MIN_MIDI, Math.min(KEYBOARD_MAX_MIDI, note.pitch));
      const rowFromTop = KEYBOARD_MAX_MIDI - clampedPitch;
      const y = padTop + rowFromTop * rowH + 0.5;
      const x = padLeft + Math.max(0, Math.min(1, note.startTime / safeDur)) * plotW;
      const xEnd = padLeft + Math.max(0, Math.min(1, note.endTime / safeDur)) * plotW;
      const w = Math.max(3.5, xEnd - x);
      const h = Math.max(2.5, rowH - 1);

      const isActive =
        isPlaying && currentTimeSec >= note.startTime && currentTimeSec <= note.endTime;

      if (isActive) {
        ctx.fillStyle = '#059669';
      } else {
        const velFrac = Math.max(0, Math.min(1, (note.velocity - 15) / 95));
        // Cobalt intensity scaled by velocity
        const alpha = 0.55 + velFrac * 0.45;
        ctx.fillStyle = `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
      }

      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 2);
      ctx.fill();
    }

    // Empty hint
    if (notes.length === 0) {
      ctx.fillStyle = '#64748B';
      ctx.font = '13px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Run transcription to populate C2–C7 piano roll notes',
        padLeft + plotW / 2,
        padTop + plotH / 2
      );
    }

    // Playhead
    if (durationSec > 0 && (isPlaying || currentTimeSec > 0)) {
      const px = padLeft + Math.max(0, Math.min(1, currentTimeSec / safeDur)) * plotW;
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();
    }
  }, [notes, durationSec, currentTimeSec, isPlaying, pitchSpan]);

  useEffect(() => {
    drawRoll();
  }, [drawRoll]);

  useEffect(() => {
    const onResize = () => drawRoll();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawRoll]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || notes.length === 0 || durationSec <= 0) {
      setHovered(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const plotW = Math.max(20, rect.width - padLeft - padRight);
    const plotH = Math.max(20, canvasHeight - padTop - padBottom);
    const rowH = plotH / pitchSpan;
    const safeDur = Math.max(1, durationSec);

    if (mx < padLeft || mx > padLeft + plotW || my < padTop || my > padTop + plotH) {
      setHovered(null);
      return;
    }

    const timeAtCursor = ((mx - padLeft) / plotW) * safeDur;
    const pitchAtCursor = KEYBOARD_MAX_MIDI - Math.floor((my - padTop) / rowH);

    const hit = notes.find(
      (n) =>
        Math.abs(n.pitch - pitchAtCursor) <= 1 &&
        timeAtCursor >= n.startTime - 0.04 &&
        timeAtCursor <= n.endTime + 0.04
    );

    if (hit) {
      setHovered({ note: hit, x: mx, y: my });
    } else {
      setHovered(null);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || durationSec <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const plotW = Math.max(20, rect.width - padLeft - padRight);
    if (mx < padLeft || mx > padLeft + plotW) return;
    const clickedTime = ((mx - padLeft) / plotW) * durationSec;
    onSeek(Math.max(0, Math.min(durationSec, clickedTime)));
  };

  return (
    <div className="relative w-full rounded-lg border border-slate-200 bg-white overflow-hidden">
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
        onClick={handleClick}
        className="block w-full cursor-crosshair"
        aria-label="C2 to C7 piano roll visualization"
      />
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-mono tabular-nums shadow-md"
          style={{
            left: Math.min(Math.max(12, hovered.x + 10), 420),
            top: Math.max(8, hovered.y - 38),
          }}
        >
          {hovered.note.noteName} · {hovered.note.startTime.toFixed(2)}s–{hovered.note.endTime.toFixed(2)}s · vel {hovered.note.velocity}
        </div>
      )}
    </div>
  );
}
