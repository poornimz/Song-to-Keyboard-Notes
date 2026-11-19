export type PipelineStageStatus = 'idle' | 'loading' | 'ready' | 'error';

export type AudioInputMethod = 'upload' | 'url' | 'builtin';

export type BuiltInClipId = 'c-major-progression' | 'a-minor-arpeggio';

export type AnalysisWindowSec = 6 | 10 | 15 | 25 | 60 | 120;

export type MonitorSource = 'piano' | 'original' | 'layered';

export interface ModelInfo {
  checkpointUrl: string;
  backend: string;
  loadLatencyMs: number;
  melBins: number;
  sampleRate: number;
  minMidiPitch: number;
  maxMidiPitch: number;
}

export interface NoteEvent {
  id: string;
  pitch: number;
  noteName: string;
  startTime: number;
  endTime: number;
  velocity: number; // 0..127
}

export interface ChordStep {
  id: string;
  startTime: number;
  endTime: number;
  notes: NoteEvent[];
  chordLabel: string;
  avgVelocity: number;
}

export interface RawTranscriptionResult {
  notes: NoteEvent[];
  totalTime: number;
  latencyMs: number;
  rawSequenceJson: Record<string, unknown>;
}
