import type { MonitorSource, NoteEvent } from '../types/notebook';
import { midiToFrequency } from '../utils/musicTheory';

export interface PlaybackFrameState {
  isPlaying: boolean;
  currentTime: number;
  activePitches: Set<number>;
}

interface ScheduledPlaybackNote {
  note: NoteEvent;
  scheduledStartSongTime: number;
}

export class PianoSynthEngine {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private pianoGain: GainNode | null = null;
  private clipGain: GainNode | null = null;

  private isPlaying = false;
  private isLooping = false;
  private speed = 1.0;
  private monitorSource: MonitorSource = 'piano';

  private notes: NoteEvent[] = [];
  private clipBuffer: AudioBuffer | null = null;
  private totalDuration = 0;

  private playbackStartCtxTime = 0;
  private playbackOffsetSongTime = 0;
  private nextScheduleSongTime = 0;
  private scheduledNoteIds = new Set<string>();

  private activeClipSource: AudioBufferSourceNode | null = null;
  private lookaheadTimer: number | null = null;
  private rafId: number | null = null;
  private activeOscillators = new Set<OscillatorNode>();

  private onFrameCallback: ((state: PlaybackFrameState) => void) | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -14;
      this.masterCompressor.knee.value = 18;
      this.masterCompressor.ratio.value = 4;
      this.masterCompressor.attack.value = 0.003;
      this.masterCompressor.release.value = 0.15;
      this.masterCompressor.connect(this.ctx.destination);

      this.pianoGain = this.ctx.createGain();
      this.clipGain = this.ctx.createGain();
      this.pianoGain.connect(this.masterCompressor);
      this.clipGain.connect(this.masterCompressor);
      this.applyMonitorGains();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private applyMonitorGains() {
    if (!this.ctx || !this.pianoGain || !this.clipGain) return;
    const now = this.ctx.currentTime;
    const pianoLevel = this.monitorSource === 'original' ? 0.0 : this.monitorSource === 'layered' ? 0.85 : 1.0;
    const clipLevel = this.monitorSource === 'piano' ? 0.0 : this.monitorSource === 'layered' ? 0.68 : 1.0;
    this.pianoGain.gain.setTargetAtTime(pianoLevel, now, 0.015);
    this.clipGain.gain.setTargetAtTime(clipLevel, now, 0.015);
  }

  public setFrameListener(cb: ((state: PlaybackFrameState) => void) | null) {
    this.onFrameCallback = cb;
  }

  public setMonitorSource(source: MonitorSource) {
    this.monitorSource = source;
    this.applyMonitorGains();
  }

  public setLoop(loop: boolean) {
    this.isLooping = loop;
  }

  public setSpeed(nextSpeed: number) {
    const clamped = Math.max(0.5, Math.min(1.25, nextSpeed));
    if (Math.abs(clamped - this.speed) < 0.001) return;

    if (this.isPlaying && this.ctx) {
      const currentSongTime = this.getCurrentSongTime();
      this.speed = clamped;
      this.restartFromTime(currentSongTime);
    } else {
      this.speed = clamped;
    }
  }

  public setData(notes: NoteEvent[], clipBuffer: AudioBuffer | null, totalDuration: number) {
    this.notes = [...notes].sort((a, b) => a.startTime - b.startTime);
    this.clipBuffer = clipBuffer;
    this.totalDuration = Math.max(0.1, totalDuration);
  }

  public playSingleKey(midi: number, velocity = 92, durationSec = 0.65) {
    const ctx = this.ensureContext();
    const when = ctx.currentTime + 0.005;
    this.triggerPianoVoice(midi, velocity, when, durationSec, this.masterCompressor!);
  }

  private triggerPianoVoice(
    midi: number,
    velocity: number,
    when: number,
    durationSec: number,
    destination: AudioNode
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const freq = midiToFrequency(midi);
    const velNorm = Math.max(0.08, Math.min(1.0, velocity / 127));
    const safeDur = Math.max(0.06, Math.min(durationSec, 4.5));
    const release = 0.14;
    const stopTime = when + safeDur + release;

    // Velocity-scaled low-pass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoffStart = Math.min(9000, freq * (3.2 + velNorm * 5.2));
    filter.frequency.setValueAtTime(cutoffStart, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.9), stopTime);
    filter.Q.value = 0.7;

    // Velocity-scaled ADSR envelope
    const env = ctx.createGain();
    const peakGain = 0.22 * Math.pow(velNorm, 1.15);
    const sustainGain = peakGain * 0.42;
    const attack = 0.006;
    const decayTime = Math.min(safeDur * 0.65, 0.28);

    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peakGain, when + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0008, sustainGain), when + attack + decayTime);
    env.gain.setValueAtTime(Math.max(0.0008, sustainGain), when + safeDur);
    env.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    // Triangle fundamental + 2nd & 3rd harmonic sine oscillators
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, when);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, when);
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.26 * velNorm;

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3, when);
    const gain3 = ctx.createGain();
    gain3.gain.value = 0.11 * velNorm;

    osc1.connect(filter);
    osc2.connect(gain2);
    gain2.connect(filter);
    osc3.connect(gain3);
    gain3.connect(filter);

    filter.connect(env);
    env.connect(destination);

    const tracked = [osc1, osc2, osc3];
    tracked.forEach((osc) => {
      this.activeOscillators.add(osc);
      osc.onended = () => {
        this.activeOscillators.delete(osc);
      };
      osc.start(when);
      osc.stop(stopTime + 0.02);
    });
  }

  public getCurrentSongTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.playbackOffsetSongTime;
    }
    const elapsedReal = Math.max(0, this.ctx.currentTime - this.playbackStartCtxTime);
    return this.playbackOffsetSongTime + elapsedReal * this.speed;
  }

  public play(fromSongTime?: number) {
    const ctx = this.ensureContext();
    const startOffset =
      fromSongTime !== undefined
        ? Math.max(0, Math.min(this.totalDuration - 0.05, fromSongTime))
        : this.playbackOffsetSongTime >= this.totalDuration - 0.05
          ? 0
          : this.playbackOffsetSongTime;

    this.clearScheduledAudio();
    this.isPlaying = true;
    this.playbackOffsetSongTime = startOffset;
    this.playbackStartCtxTime = ctx.currentTime + 0.03;
    this.nextScheduleSongTime = startOffset;
    this.scheduledNoteIds.clear();

    this.startClipSource(startOffset, this.playbackStartCtxTime);
    this.startLookaheadLoop();
    this.startVisualLoop();
  }

  public pause() {
    if (!this.isPlaying) return;
    const currentTime = Math.min(this.totalDuration, this.getCurrentSongTime());
    this.isPlaying = false;
    this.playbackOffsetSongTime = currentTime;
    this.clearScheduledAudio();
    this.stopLoops();
    this.emitFrame(currentTime, false);
  }

  public stop() {
    this.isPlaying = false;
    this.playbackOffsetSongTime = 0;
    this.clearScheduledAudio();
    this.stopLoops();
    this.emitFrame(0, false);
  }

  public seek(songTime: number) {
    const clamped = Math.max(0, Math.min(this.totalDuration, songTime));
    if (this.isPlaying) {
      this.play(clamped);
    } else {
      this.playbackOffsetSongTime = clamped;
      this.emitFrame(clamped, false);
    }
  }

  private restartFromTime(songTime: number) {
    this.clearScheduledAudio();
    if (!this.ctx) return;
    this.playbackOffsetSongTime = Math.max(0, Math.min(this.totalDuration, songTime));
    this.playbackStartCtxTime = this.ctx.currentTime + 0.025;
    this.nextScheduleSongTime = this.playbackOffsetSongTime;
    this.scheduledNoteIds.clear();
    this.startClipSource(this.playbackOffsetSongTime, this.playbackStartCtxTime);
  }

  private startClipSource(offsetSongTime: number, startCtxTime: number) {
    if (!this.ctx || !this.clipGain || !this.clipBuffer) return;
    if (offsetSongTime >= this.clipBuffer.duration) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.clipBuffer;
    src.playbackRate.value = this.speed;
    src.connect(this.clipGain);
    src.start(startCtxTime, offsetSongTime);
    this.activeClipSource = src;
  }

  private clearScheduledAudio() {
    if (this.activeClipSource) {
      try {
        this.activeClipSource.stop();
        this.activeClipSource.disconnect();
      } catch {
        // ignore already stopped
      }
      this.activeClipSource = null;
    }

    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {
        // ignore
      }
    }
    this.activeOscillators.clear();
  }

  private startLookaheadLoop() {
    if (this.lookaheadTimer !== null) {
      window.clearInterval(this.lookaheadTimer);
    }

    const scheduleAheadRealSec = 0.14;

    const tick = () => {
      if (!this.isPlaying || !this.ctx || !this.pianoGain) return;
      const nowSongTime = this.getCurrentSongTime();
      const horizonSongTime = nowSongTime + scheduleAheadRealSec * this.speed;

      const toSchedule: ScheduledPlaybackNote[] = [];
      for (const note of this.notes) {
        if (note.startTime >= this.nextScheduleSongTime - 0.001 && note.startTime <= horizonSongTime) {
          if (!this.scheduledNoteIds.has(note.id)) {
            toSchedule.push({ note, scheduledStartSongTime: note.startTime });
            this.scheduledNoteIds.add(note.id);
          }
        }
      }

      for (const item of toSchedule) {
        const deltaSong = item.scheduledStartSongTime - this.playbackOffsetSongTime;
        const whenCtx = this.playbackStartCtxTime + deltaSong / this.speed;
        if (whenCtx >= this.ctx.currentTime - 0.02) {
          const scaledDur = Math.max(0.05, (item.note.endTime - item.note.startTime) / this.speed);
          this.triggerPianoVoice(
            item.note.pitch,
            item.note.velocity,
            Math.max(this.ctx.currentTime, whenCtx),
            scaledDur,
            this.pianoGain
          );
        }
      }

      this.nextScheduleSongTime = Math.max(this.nextScheduleSongTime, horizonSongTime);

      if (nowSongTime >= this.totalDuration) {
        if (this.isLooping) {
          this.restartFromTime(0);
        } else {
          this.stop();
        }
      }
    };

    tick();
    this.lookaheadTimer = window.setInterval(tick, 25);
  }

  private startVisualLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    const loop = () => {
      if (!this.isPlaying) return;
      const current = Math.min(this.totalDuration, this.getCurrentSongTime());
      this.emitFrame(current, true);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopLoops() {
    if (this.lookaheadTimer !== null) {
      window.clearInterval(this.lookaheadTimer);
      this.lookaheadTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private emitFrame(songTime: number, playing: boolean) {
    if (!this.onFrameCallback) return;
    const activePitches = new Set<number>();
    if (playing) {
      for (const n of this.notes) {
        if (songTime >= n.startTime && songTime <= n.endTime) {
          activePitches.add(n.pitch);
        }
      }
    }
    this.onFrameCallback({
      isPlaying: playing,
      currentTime: songTime,
      activePitches,
    });
  }

  public dispose() {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
