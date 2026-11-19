import type { ChordStep, NoteEvent } from '../types/notebook';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const KEYBOARD_MIN_MIDI = 36; // C2
export const KEYBOARD_MAX_MIDI = 96; // C7

export function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const note = NOTE_NAMES[clamped % 12];
  return `${note}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function formatTimeSec(sec: number): string {
  const safe = Math.max(0, sec);
  return `${safe.toFixed(2)}s`;
}

export function groupNotesIntoSteps(
  notes: NoteEvent[],
  windowThresholdSec = 0.055
): ChordStep[] {
  if (notes.length === 0) return [];

  const sorted = [...notes].sort((a, b) => {
    if (Math.abs(a.startTime - b.startTime) > 0.0005) {
      return a.startTime - b.startTime;
    }
    return a.pitch - b.pitch;
  });

  const groups: NoteEvent[][] = [];
  let currentGroup: NoteEvent[] = [];
  let groupAnchorTime = 0;

  for (const note of sorted) {
    if (currentGroup.length === 0) {
      currentGroup = [note];
      groupAnchorTime = note.startTime;
    } else if (note.startTime - groupAnchorTime <= windowThresholdSec) {
      currentGroup.push(note);
    } else {
      groups.push(currentGroup);
      currentGroup = [note];
      groupAnchorTime = note.startTime;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.map((group, index) => {
    // Deduplicate identical pitches in the same chord step, keeping highest velocity
    const byPitch = new Map<number, NoteEvent>();
    for (const n of group) {
      const existing = byPitch.get(n.pitch);
      if (!existing || n.velocity > existing.velocity) {
        byPitch.set(n.pitch, n);
      }
    }
    const uniqueSorted = Array.from(byPitch.values()).sort((a, b) => a.pitch - b.pitch);
    const startTime = Math.min(...uniqueSorted.map((n) => n.startTime));
    const endTime = Math.max(...uniqueSorted.map((n) => n.endTime));
    const avgVelocity = Math.round(
      uniqueSorted.reduce((acc, n) => acc + n.velocity, 0) / uniqueSorted.length
    );

    return {
      id: `step-${index}-${Math.round(startTime * 1000)}`,
      startTime,
      endTime,
      notes: uniqueSorted,
      chordLabel: uniqueSorted.map((n) => n.noteName).join(' + '),
      avgVelocity,
    };
  });
}

export function formatNoteListText(steps: ChordStep[], clipTitle: string): string {
  if (steps.length === 0) {
    return `# ${clipTitle}\nNo notes detected above the active velocity threshold.`;
  }
  const lines = [
    `# Song to Keyboard Notes — ${clipTitle}`,
    `# ${steps.length} keyboard steps (55 ms chord grouping)`,
    '',
  ];
  for (const step of steps) {
    const dur = Math.max(0.05, step.endTime - step.startTime);
    lines.push(
      `${step.startTime.toFixed(2).padStart(6, ' ')}s  |  ${step.chordLabel.padEnd(22, ' ')}  |  dur ${dur.toFixed(2)}s  |  vel ${step.avgVelocity}`
    );
  }
  return lines.join('\n');
}
