import * as tf from '@tensorflow/tfjs';
import { OnsetsAndFrames } from '@magenta/music/esm/transcription';
import { preprocessAudio } from '@magenta/music/esm/transcription/audio_utils';
import {
  MAX_MIDI_PITCH,
  MEL_SPEC_BINS,
  MIN_MIDI_PITCH,
  SAMPLE_RATE,
} from '@magenta/music/esm/transcription/constants';
import { sequenceProtoToMidi } from '@magenta/music/esm/core/midi_io';
import type { INoteSequence } from '@magenta/music/esm/protobuf';
import type { ModelInfo, NoteEvent, RawTranscriptionResult } from '../types/notebook';
import { midiToNoteName } from '../utils/musicTheory';

export const ONSETS_AND_FRAMES_CHECKPOINT =
  'https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni';

let modelInstance: OnsetsAndFrames | null = null;
let modelLoadPromise: Promise<ModelInfo> | null = null;
let cachedModelInfo: ModelInfo | null = null;

export function getLoadedModelInfo(): ModelInfo | null {
  return cachedModelInfo;
}

export async function loadOnsetsAndFramesModel(): Promise<ModelInfo> {
  if (modelInstance?.isInitialized() && cachedModelInfo) {
    return cachedModelInfo;
  }
  if (modelLoadPromise) {
    return modelLoadPromise;
  }

  modelLoadPromise = (async () => {
    const t0 = performance.now();
    await tf.ready();
    const backend = tf.getBackend() || 'cpu';

    if (!modelInstance) {
      modelInstance = new OnsetsAndFrames(ONSETS_AND_FRAMES_CHECKPOINT);
    }
    if (!modelInstance.isInitialized()) {
      await modelInstance.initialize();
    }

    const loadLatencyMs = Math.round(performance.now() - t0);
    cachedModelInfo = {
      checkpointUrl: ONSETS_AND_FRAMES_CHECKPOINT,
      backend,
      loadLatencyMs,
      melBins: MEL_SPEC_BINS,
      sampleRate: SAMPLE_RATE,
      minMidiPitch: MIN_MIDI_PITCH,
      maxMidiPitch: MAX_MIDI_PITCH,
    };
    return cachedModelInfo;
  })();

  try {
    return await modelLoadPromise;
  } catch (err) {
    modelLoadPromise = null;
    throw err;
  }
}

export async function computeMelSpectrogram(audioBuffer: AudioBuffer): Promise<Float32Array[]> {
  return preprocessAudio(audioBuffer);
}

export async function transcribeMelSpectrogram(
  melSpec: Float32Array[]
): Promise<RawTranscriptionResult> {
  await loadOnsetsAndFramesModel();
  if (!modelInstance || !modelInstance.isInitialized()) {
    throw new Error('OnsetsAndFrames model failed to initialize.');
  }

  const t0 = performance.now();
  const melArray = melSpec.map((frame) => Array.from(frame));
  const noteSequence = await modelInstance.transcribeFromMelSpec(melArray);
  const latencyMs = Math.round(performance.now() - t0);

  const notes: NoteEvent[] = (noteSequence.notes || []).map((n, index) => {
    const pitch = n.pitch ?? 60;
    const startTime = Number((n.startTime ?? 0).toFixed(4));
    const endTime = Number(Math.max(startTime + 0.05, n.endTime ?? startTime + 0.1).toFixed(4));
    const velocity = Math.max(1, Math.min(127, Math.round(n.velocity ?? 64)));
    return {
      id: `note-${index}-${pitch}-${Math.round(startTime * 1000)}`,
      pitch,
      noteName: midiToNoteName(pitch),
      startTime,
      endTime,
      velocity,
    };
  });

  const totalTime =
    noteSequence.totalTime ||
    (notes.length > 0 ? Math.max(...notes.map((n) => n.endTime)) : 0);

  const rawSequenceJson: Record<string, unknown> = {
    totalTime: Number(totalTime.toFixed(3)),
    tempos: noteSequence.tempos?.length ? noteSequence.tempos : [{ time: 0, qpm: 120 }],
    notes: notes.map((n) => ({
      pitch: n.pitch,
      noteName: n.noteName,
      startTime: n.startTime,
      endTime: n.endTime,
      velocity: n.velocity,
    })),
  };

  return {
    notes,
    totalTime,
    latencyMs,
    rawSequenceJson,
  };
}

export function exportFilteredNotesToMidi(notes: NoteEvent[], totalTime: number): Uint8Array {
  const ns: INoteSequence = {
    notes: notes.map((n) => ({
      pitch: n.pitch,
      startTime: n.startTime,
      endTime: n.endTime,
      velocity: n.velocity,
      instrument: 0,
      program: 0,
      isDrum: false,
    })),
    controlChanges: [],
    tempos: [{ time: 0, qpm: 120 }],
    timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
    totalTime: Math.max(totalTime, notes.length > 0 ? Math.max(...notes.map((n) => n.endTime)) : 0),
  };
  return sequenceProtoToMidi(ns);
}
