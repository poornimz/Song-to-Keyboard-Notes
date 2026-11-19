import type { BuiltInClipId } from '../types/notebook';
import { midiToFrequency } from '../utils/musicTheory';

export interface BuiltInClipSpec {
  id: BuiltInClipId;
  title: string;
  subtitle: string;
  durationSec: number;
}

export const BUILTIN_CLIPS: ReadonlyArray<BuiltInClipSpec> = [
  {
    id: 'c-major-progression',
    title: 'C Major Chord Progression',
    subtitle: 'I – V – vi – IV ballad voicing with top-line melody (8.0s)',
    durationSec: 8.0,
  },
  {
    id: 'a-minor-arpeggio',
    title: 'A Minor Arpeggio Etude',
    subtitle: 'Flowing classical Am – Dm – E7 – Am broken chords (8.5s)',
    durationSec: 8.5,
  },
];

interface ScheduledSynthNote {
  midi: number;
  start: number;
  duration: number;
  velocity: number; // 0..1
}

function scheduleOfflinePianoNote(
  ctx: OfflineAudioContext,
  destination: AudioNode,
  note: ScheduledSynthNote
) {
  const freq = midiToFrequency(note.midi);
  const attack = 0.008;
  const decayEnd = note.start + Math.min(note.duration, 0.35);
  const release = 0.14;
  const stopTime = note.start + note.duration + release;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(7200, freq * (3.5 + note.velocity * 4.5)), note.start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2.1), stopTime);
  filter.Q.value = 0.8;

  const env = ctx.createGain();
  const peak = 0.24 * note.velocity;
  const sustain = peak * 0.45;
  env.gain.setValueAtTime(0.0001, note.start);
  env.gain.linearRampToValueAtTime(peak, note.start + attack);
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, sustain), decayEnd);
  env.gain.setValueAtTime(Math.max(0.001, sustain), note.start + note.duration);
  env.gain.exponentialRampToValueAtTime(0.0001, stopTime);

  const oscFund = ctx.createOscillator();
  oscFund.type = 'triangle';
  oscFund.frequency.setValueAtTime(freq, note.start);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, note.start);
  const gain2 = ctx.createGain();
  gain2.gain.value = 0.28 * note.velocity;

  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 3, note.start);
  const gain3 = ctx.createGain();
  gain3.gain.value = 0.12 * note.velocity;

  oscFund.connect(filter);
  osc2.connect(gain2);
  gain2.connect(filter);
  osc3.connect(gain3);
  gain3.connect(filter);

  filter.connect(env);
  env.connect(destination);

  oscFund.start(note.start);
  osc2.start(note.start);
  osc3.start(note.start);

  oscFund.stop(stopTime + 0.02);
  osc2.stop(stopTime + 0.02);
  osc3.stop(stopTime + 0.02);
}

function getClipNotes(clipId: BuiltInClipId): { durationSec: number; notes: ScheduledSynthNote[] } {
  if (clipId === 'c-major-progression') {
    const notes: ScheduledSynthNote[] = [
      // Bar 1: C major (C3 + C4-E4-G4) + melody E5 -> G5
      { midi: 48, start: 0.15, duration: 1.7, velocity: 0.82 },
      { midi: 60, start: 0.15, duration: 1.65, velocity: 0.76 },
      { midi: 64, start: 0.15, duration: 1.65, velocity: 0.74 },
      { midi: 67, start: 0.15, duration: 1.65, velocity: 0.76 },
      { midi: 76, start: 0.65, duration: 0.5, velocity: 0.85 },
      { midi: 79, start: 1.25, duration: 0.6, velocity: 0.88 },

      // Bar 2: G major (G2 + B3-D4-G4) + melody D5 -> B4
      { midi: 43, start: 2.05, duration: 1.7, velocity: 0.82 },
      { midi: 59, start: 2.05, duration: 1.65, velocity: 0.74 },
      { midi: 62, start: 2.05, duration: 1.65, velocity: 0.75 },
      { midi: 67, start: 2.05, duration: 1.65, velocity: 0.78 },
      { midi: 74, start: 2.55, duration: 0.5, velocity: 0.84 },
      { midi: 71, start: 3.15, duration: 0.6, velocity: 0.82 },

      // Bar 3: A minor (A2 + C4-E4-A4) + melody C5 -> E5
      { midi: 45, start: 3.95, duration: 1.7, velocity: 0.84 },
      { midi: 60, start: 3.95, duration: 1.65, velocity: 0.75 },
      { midi: 64, start: 3.95, duration: 1.65, velocity: 0.75 },
      { midi: 69, start: 3.95, duration: 1.65, velocity: 0.78 },
      { midi: 72, start: 4.45, duration: 0.5, velocity: 0.86 },
      { midi: 76, start: 5.05, duration: 0.6, velocity: 0.88 },

      // Bar 4: F major -> C major cadence
      { midi: 41, start: 5.85, duration: 0.95, velocity: 0.84 },
      { midi: 57, start: 5.85, duration: 0.9, velocity: 0.76 },
      { midi: 60, start: 5.85, duration: 0.9, velocity: 0.76 },
      { midi: 65, start: 5.85, duration: 0.9, velocity: 0.78 },

      { midi: 48, start: 6.9, duration: 0.95, velocity: 0.86 },
      { midi: 60, start: 6.9, duration: 0.95, velocity: 0.8 },
      { midi: 64, start: 6.9, duration: 0.95, velocity: 0.8 },
      { midi: 67, start: 6.9, duration: 0.95, velocity: 0.82 },
      { midi: 72, start: 6.9, duration: 0.95, velocity: 0.88 },
    ];
    return { durationSec: 8.0, notes };
  }

  // A Minor Arpeggio Etude
  const pattern: Array<{ bass: number; arp: number[]; start: number; step: number }> = [
    { bass: 45, arp: [57, 60, 64, 69, 64, 60], start: 0.15, step: 0.32 }, // Am
    { bass: 50, arp: [57, 62, 65, 69, 65, 62], start: 2.15, step: 0.32 }, // Dm
    { bass: 40, arp: [56, 59, 64, 68, 64, 59], start: 4.15, step: 0.32 }, // E
    { bass: 45, arp: [57, 60, 64, 69, 72, 76], start: 6.15, step: 0.32 }, // Am resolve
  ];

  const notes: ScheduledSynthNote[] = [];
  for (const bar of pattern) {
    notes.push({
      midi: bar.bass,
      start: bar.start,
      duration: 1.75,
      velocity: 0.8,
    });
    bar.arp.forEach((midi, idx) => {
      notes.push({
        midi,
        start: bar.start + idx * bar.step,
        duration: idx === bar.arp.length - 1 ? 0.45 : 0.32,
        velocity: 0.72 + (idx % 3) * 0.06,
      });
    });
  }
  // Final resolving chord
  notes.push(
    { midi: 45, start: 7.95, duration: 0.48, velocity: 0.78 },
    { midi: 69, start: 7.95, duration: 0.48, velocity: 0.84 }
  );

  return { durationSec: 8.5, notes };
}

export async function renderBuiltInClip(clipId: BuiltInClipId): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const { durationSec, notes } = getClipNotes(clipId);
  const totalFrames = Math.ceil(durationSec * sampleRate);

  const offlineCtx = new OfflineAudioContext(1, totalFrames, sampleRate);
  const master = offlineCtx.createGain();
  master.gain.value = 0.88;
  master.connect(offlineCtx.destination);

  for (const note of notes) {
    scheduleOfflinePianoNote(offlineCtx, master, note);
  }

  return offlineCtx.startRendering();
}

export function sliceAudioBuffer(
  source: AudioBuffer,
  offsetSec: number,
  windowSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.min(source.length - 1, Math.floor(offsetSec * sampleRate)));
  const maxAvailableSamples = Math.max(1, source.length - startSample);
  const desiredSamples = Math.floor(windowSec * sampleRate);
  const sliceLength = Math.max(1, Math.min(maxAvailableSamples, desiredSamples));

  const channels = source.numberOfChannels;
  const sliced = new AudioBuffer({
    length: sliceLength,
    numberOfChannels: channels,
    sampleRate,
  });

  for (let ch = 0; ch < channels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = sliced.getChannelData(ch);
    dstData.set(srcData.subarray(startSample, startSample + sliceLength));
  }

  return sliced;
}
