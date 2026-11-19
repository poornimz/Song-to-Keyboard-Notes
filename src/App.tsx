import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_CLIPS, renderBuiltInClip, sliceAudioBuffer } from './audio/builtInClips';
import { PianoSynthEngine } from './audio/pianoSynth';
import { CellAudioMel } from './components/CellAudioMel';
import { CellModelLoader } from './components/CellModelLoader';
import { CellPlayAlongKeyboard } from './components/CellPlayAlongKeyboard';
import { CellTranscriptionRoll } from './components/CellTranscriptionRoll';
import { PipelineHeader } from './components/PipelineHeader';
import {
  computeMelSpectrogram,
  exportFilteredNotesToMidi,
  loadOnsetsAndFramesModel,
  transcribeMelSpectrogram,
} from './ml/magentaTranscription';
import type {
  AnalysisWindowSec,
  AudioInputMethod,
  BuiltInClipId,
  ModelInfo,
  MonitorSource,
  NoteEvent,
  PipelineStageStatus,
} from './types/notebook';
import { formatNoteListText, groupNotesIntoSteps } from './utils/musicTheory';

export default function App() {
  // Cell 1: Model State
  const [modelStatus, setModelStatus] = useState<PipelineStageStatus>('idle');
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // Cell 2: Audio & Mel Spectrogram State
  const [inputMethod, setInputMethod] = useState<AudioInputMethod>('builtin');
  const [audioStatus, setAudioStatus] = useState<PipelineStageStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [clipTitle, setClipTitle] = useState<string>('C Major Chord Progression');
  const [activeBuiltInId, setActiveBuiltInId] = useState<BuiltInClipId | null>('c-major-progression');
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [slicedBuffer, setSlicedBuffer] = useState<AudioBuffer | null>(null);
  const [offsetSec, setOffsetSec] = useState<number>(0);
  const [windowSec, setWindowSec] = useState<AnalysisWindowSec>(10);
  const [melSpec, setMelSpec] = useState<Float32Array[] | null>(null);

  // Cell 3: Transcription & Filtering State
  const [transcribeStatus, setTranscribeStatus] = useState<PipelineStageStatus>('idle');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [rawNotes, setRawNotes] = useState<NoteEvent[]>([]);
  const [transcribeLatencyMs, setTranscribeLatencyMs] = useState<number | null>(null);
  const [rawSequenceJson, setRawSequenceJson] = useState<Record<string, unknown> | null>(null);
  const [minVelocity, setMinVelocity] = useState<number>(30);

  // Cell 4: Play-Along & Synth State
  const [monitorSource, setMonitorSource] = useState<MonitorSource>('piano');
  const [speed, setSpeed] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [activePitches, setActivePitches] = useState<Set<number>>(new Set());

  // Preview Clip playback in Cell 2
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewTimeSec, setPreviewTimeSec] = useState<number>(0);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const previewStartTimeRef = useRef<number>(0);

  // Polyphonic Piano Synth + Lookahead Engine
  const synthRef = useRef<PianoSynthEngine | null>(null);
  const [isPipelineBusy, setIsPipelineBusy] = useState<boolean>(false);

  const slicedDurationSec = slicedBuffer?.duration ?? 0;

  // Filtered notes & 55ms chord steps derived reactively from velocity slider
  const filteredNotes = useMemo(() => {
    return rawNotes.filter((n) => n.velocity >= minVelocity);
  }, [rawNotes, minVelocity]);

  const chordSteps = useMemo(() => {
    return groupNotesIntoSteps(filteredNotes, 0.055);
  }, [filteredNotes]);

  const stopPreviewClip = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      previewSourceRef.current = null;
    }
    setIsPreviewPlaying(false);
    setPreviewTimeSec(0);
  }, []);

  // Initialize PianoSynthEngine once
  useEffect(() => {
    const engine = new PianoSynthEngine();
    engine.setFrameListener((frame) => {
      setIsPlaying(frame.isPlaying);
      setCurrentTimeSec(frame.currentTime);
      setActivePitches(frame.activePitches);
    });
    synthRef.current = engine;

    return () => {
      stopPreviewClip();
      engine.dispose();
      synthRef.current = null;
      if (previewCtxRef.current) {
        void previewCtxRef.current.close();
        previewCtxRef.current = null;
      }
    };
  }, [stopPreviewClip]);

  // Keep synth data synchronized whenever filteredNotes or slicedBuffer changes
  useEffect(() => {
    const engine = synthRef.current;
    if (!engine) return;
    const dur = Math.max(
      slicedBuffer?.duration ?? 0,
      filteredNotes.length > 0 ? Math.max(...filteredNotes.map((n) => n.endTime)) : 0
    );
    engine.setData(filteredNotes, slicedBuffer, dur);
  }, [filteredNotes, slicedBuffer]);

  // Re-slice & recompute 229-bin Mel spectrogram whenever sourceBuffer, offsetSec, or windowSec changes
  useEffect(() => {
    if (!sourceBuffer) return;
    let cancelled = false;

    const maxOffset = Math.max(
      0,
      sourceBuffer.duration - Math.min(windowSec, sourceBuffer.duration)
    );
    const clampedOffset = Math.min(offsetSec, maxOffset);
    if (Math.abs(clampedOffset - offsetSec) > 0.01) {
      setOffsetSec(Number(clampedOffset.toFixed(1)));
    }

    const updateMel = async () => {
      stopPreviewClip();
      synthRef.current?.stop();
      setAudioStatus('loading');
      setAudioError(null);
      try {
        const sliced = sliceAudioBuffer(sourceBuffer, clampedOffset, windowSec);
        const spec = await computeMelSpectrogram(sliced);
        if (cancelled) return;
        setSlicedBuffer(sliced);
        setMelSpec(spec);
        setAudioStatus('ready');
        // Clear previous transcription when audio slice changes
        setRawNotes([]);
        setRawSequenceJson(null);
        setTranscribeLatencyMs(null);
        setTranscribeStatus('idle');
        setTranscribeError(null);
      } catch (err) {
        if (cancelled) return;
        setAudioStatus('error');
        setAudioError(
          err instanceof Error ? err.message : 'Failed to compute 229-bin Mel spectrogram.'
        );
      }
    };

    void updateMel();
    return () => {
      cancelled = true;
    };
  }, [sourceBuffer, offsetSec, windowSec, stopPreviewClip]);

  // Load default built-in piano clip on first mount so the workspace is immediately interactive
  const handleSelectBuiltIn = useCallback(async (id: BuiltInClipId) => {
    stopPreviewClip();
    synthRef.current?.stop();
    setInputMethod('builtin');
    setActiveBuiltInId(id);
    setAudioStatus('loading');
    setAudioError(null);

    const spec = BUILTIN_CLIPS.find((c) => c.id === id);
    try {
      const buffer = await renderBuiltInClip(id);
      setClipTitle(spec?.title ?? 'Built-In Piano Clip');
      setOffsetSec(0);
      setSourceBuffer(buffer);
    } catch (err) {
      setAudioStatus('error');
      setAudioError(
        err instanceof Error ? err.message : 'Failed to render built-in piano clip.'
      );
    }
  }, [stopPreviewClip]);

  useEffect(() => {
    void handleSelectBuiltIn('c-major-progression');
  }, [handleSelectBuiltIn]);

  // Cell 1 Handler: Load OnsetsAndFrames
  const handleLoadModel = useCallback(async (): Promise<ModelInfo | null> => {
    setModelStatus('loading');
    setModelError(null);
    try {
      const info = await loadOnsetsAndFramesModel();
      setModelInfo(info);
      setModelStatus('ready');
      return info;
    } catch (err) {
      setModelStatus('error');
      setModelError(
        err instanceof Error
          ? err.message
          : 'Unable to download or initialize the OnsetsAndFrames model weights.'
      );
      return null;
    }
  }, []);

  // Decode raw ArrayBuffer with Web Audio API
  const decodeAudioBytes = useCallback(async (arrayBuffer: ArrayBuffer, title: string) => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setClipTitle(title);
      setActiveBuiltInId(null);
      setOffsetSec(0);
      setSourceBuffer(decoded);
    } finally {
      void ctx.close();
    }
  }, []);

  // Cell 2 Upload Handler
  const handleUploadFile = useCallback(
    async (file: File) => {
      stopPreviewClip();
      synthRef.current?.stop();
      setAudioStatus('loading');
      setAudioError(null);
      try {
        const bytes = await file.arrayBuffer();
        await decodeAudioBytes(bytes, file.name);
      } catch {
        setAudioStatus('error');
        setAudioError(
          `Could not decode "${file.name}". Please ensure it is a valid .mp3, .wav, .m4a, or .ogg audio file.`
        );
      }
    },
    [decodeAudioBytes, stopPreviewClip]
  );

  // Cell 2 URL Proxy Handler
  const handleFetchAudioUrl = useCallback(
    async (url: string) => {
      stopPreviewClip();
      synthRef.current?.stop();
      setAudioStatus('loading');
      setAudioError(null);
      try {
        const response = await fetch('/api/fetch-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          let message = `Unable to fetch audio (HTTP ${response.status}).`;
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload.error) message = payload.error;
          } catch {
            // ignore JSON parse error
          }
          throw new Error(message);
        }

        const bytes = await response.arrayBuffer();
        const urlName = (() => {
          try {
            const parsed = new URL(url);
            const seg = parsed.pathname.split('/').filter(Boolean).pop();
            return seg || parsed.hostname;
          } catch {
            return 'Remote Audio Clip';
          }
        })();

        await decodeAudioBytes(bytes, urlName);
      } catch (err) {
        setAudioStatus('error');
        setAudioError(err instanceof Error ? err.message : 'Failed to load remote audio URL.');
      }
    },
    [decodeAudioBytes, stopPreviewClip]
  );

  // Cell 2 Preview Clip Toggle
  const handleTogglePreviewClip = useCallback(() => {
    if (!slicedBuffer) return;
    if (isPreviewPlaying) {
      stopPreviewClip();
      return;
    }

    // Stop Cell 4 playback if active
    synthRef.current?.stop();

    if (!previewCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      previewCtxRef.current = new AudioCtx();
    }
    const ctx = previewCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const src = ctx.createBufferSource();
    src.buffer = slicedBuffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (previewSourceRef.current === src) {
        stopPreviewClip();
      }
    };

    previewSourceRef.current = src;
    previewStartTimeRef.current = ctx.currentTime;
    setIsPreviewPlaying(true);
    setPreviewTimeSec(0);
    src.start();

    const updateProgress = () => {
      if (!previewCtxRef.current || !previewSourceRef.current) return;
      const elapsed = previewCtxRef.current.currentTime - previewStartTimeRef.current;
      if (elapsed >= slicedBuffer.duration) {
        stopPreviewClip();
        return;
      }
      setPreviewTimeSec(elapsed);
      previewRafRef.current = requestAnimationFrame(updateProgress);
    };
    previewRafRef.current = requestAnimationFrame(updateProgress);
  }, [slicedBuffer, isPreviewPlaying, stopPreviewClip]);

  // Cell 3 Transcription Handler (auto-loads model if needed!)
  const handleTranscribe = useCallback(async () => {
    if (!melSpec || melSpec.length === 0) return;
    stopPreviewClip();
    synthRef.current?.stop();
    setTranscribeStatus('loading');
    setTranscribeError(null);

    try {
      if (modelStatus !== 'ready') {
        setModelStatus('loading');
        setModelError(null);
        const info = await loadOnsetsAndFramesModel();
        setModelInfo(info);
        setModelStatus('ready');
      }

      const result = await transcribeMelSpectrogram(melSpec);
      setRawNotes(result.notes);
      setTranscribeLatencyMs(result.latencyMs);
      setRawSequenceJson(result.rawSequenceJson);
      setTranscribeStatus('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
      if (modelStatus !== 'ready') {
        setModelStatus('error');
        setModelError(msg);
      }
      setTranscribeStatus('error');
      setTranscribeError(msg);
    }
  }, [melSpec, modelStatus, stopPreviewClip]);

  // Top Bar CTA: Run All Cells
  const handleRunFullPipeline = useCallback(async () => {
    setIsPipelineBusy(true);
    try {
      await handleLoadModel();
      if (melSpec && melSpec.length > 0) {
        await handleTranscribe();
      }
    } finally {
      setIsPipelineBusy(false);
    }
  }, [handleLoadModel, handleTranscribe, melSpec]);

  // Cell 4 Transport & Keyboard Handlers
  const handlePlayPause = useCallback(() => {
    const engine = synthRef.current;
    if (!engine) return;
    stopPreviewClip();
    if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  }, [isPlaying, stopPreviewClip]);

  const handleStop = useCallback(() => {
    synthRef.current?.stop();
  }, []);

  const handleSeek = useCallback((timeSec: number) => {
    stopPreviewClip();
    synthRef.current?.seek(timeSec);
  }, [stopPreviewClip]);

  const handleChangeMonitorSource = useCallback((source: MonitorSource) => {
    setMonitorSource(source);
    synthRef.current?.setMonitorSource(source);
  }, []);

  const handleChangeSpeed = useCallback((nextSpeed: number) => {
    setSpeed(nextSpeed);
    synthRef.current?.setSpeed(nextSpeed);
  }, []);

  const handleToggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const next = !prev;
      synthRef.current?.setLoop(next);
      return next;
    });
  }, []);

  const handleVirtualKeyPress = useCallback((midi: number) => {
    synthRef.current?.playSingleKey(midi, 94, 0.7);
  }, []);

  const handleAuditionStep = useCallback(
    (step: { startTime: number; notes: NoteEvent[] }) => {
      const engine = synthRef.current;
      if (!engine) return;
      for (const n of step.notes) {
        engine.playSingleKey(n.pitch, n.velocity, Math.max(0.25, n.endTime - n.startTime));
      }
      engine.seek(step.startTime);
    },
    []
  );

  const handleCopyNoteList = useCallback(async (): Promise<boolean> => {
    const text = formatNoteListText(chordSteps, clipTitle);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, [chordSteps, clipTitle]);

  const handleExportMidi = useCallback(() => {
    if (filteredNotes.length === 0) return;
    const midiBytes = exportFilteredNotesToMidi(filteredNotes, slicedDurationSec);
    const blob = new Blob([new Uint8Array(midiBytes)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeName = clipTitle
      .toLowerCase()
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    anchor.href = url;
    anchor.download = `${safeName || 'transcribed-piano'}.mid`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [filteredNotes, slicedDurationSec, clipTitle]);

  const activeSpectrogramTime = isPreviewPlaying ? previewTimeSec : currentTimeSec;
  const activeSpectrogramPlaying = isPreviewPlaying || isPlaying;

  return (
    <div id="top" className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <PipelineHeader
        modelStatus={modelStatus}
        modelInfo={modelInfo}
        audioStatus={audioStatus}
        audioDetail={
          melSpec ? `${slicedDurationSec.toFixed(1)}s · 229 bins` : 'Waiting for clip'
        }
        transcribeStatus={transcribeStatus}
        filteredNoteCount={filteredNotes.length}
        transcribeLatencyMs={transcribeLatencyMs}
        isPlaying={isPlaying}
        isPipelineBusy={isPipelineBusy}
        onRunFullPipeline={handleRunFullPipeline}
      />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Studio Intro Heading */}
        <div className="max-w-3xl space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Transcribe songs into playable piano notes locally in your browser
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Follow the four notebook stages below to load Magenta&apos;s Onsets &amp; Frames model,
            inspect a 229-bin Mel spectrogram, filter detected piano roll notes, and play along on
            a 61-key virtual keyboard.
          </p>
        </div>

        {/* In [1] — Model Loader */}
        <CellModelLoader
          status={modelStatus}
          modelInfo={modelInfo}
          error={modelError}
          onLoadModel={handleLoadModel}
        />

        {/* In [2] — Load Song Audio, Slice Clip & Render Mel Spectrogram */}
        <CellAudioMel
          inputMethod={inputMethod}
          onChangeInputMethod={setInputMethod}
          audioStatus={audioStatus}
          audioError={audioError}
          clipTitle={clipTitle}
          sourceDurationSec={sourceBuffer?.duration ?? 0}
          sourceSampleRate={sourceBuffer?.sampleRate ?? 44100}
          offsetSec={offsetSec}
          onChangeOffsetSec={setOffsetSec}
          windowSec={windowSec}
          onChangeWindowSec={setWindowSec}
          slicedDurationSec={slicedDurationSec}
          melSpec={melSpec}
          activeBuiltInId={activeBuiltInId}
          isPreviewPlaying={isPreviewPlaying}
          previewTimeSec={activeSpectrogramTime}
          onUploadFile={handleUploadFile}
          onFetchAudioUrl={handleFetchAudioUrl}
          onSelectBuiltIn={handleSelectBuiltIn}
          onTogglePreviewClip={handleTogglePreviewClip}
        />

        {/* In [3] — Transcribe Audio to Keyboard Notes & Piano Roll */}
        <CellTranscriptionRoll
          transcribeStatus={transcribeStatus}
          transcribeError={transcribeError}
          hasMelSpec={melSpec !== null && melSpec.length > 0}
          latencyMs={transcribeLatencyMs}
          rawNoteCount={rawNotes.length}
          filteredNotes={filteredNotes}
          chordSteps={chordSteps}
          minVelocity={minVelocity}
          onChangeMinVelocity={setMinVelocity}
          durationSec={slicedDurationSec}
          currentTimeSec={activeSpectrogramPlaying || currentTimeSec > 0 ? currentTimeSec : 0}
          isPlaying={isPlaying}
          onTranscribe={handleTranscribe}
          onSeek={handleSeek}
          onAuditionStep={handleAuditionStep}
          rawSequenceJson={rawSequenceJson}
        />

        {/* In [4] — Interactive Play-Along Virtual Keyboard & Export */}
        <CellPlayAlongKeyboard
          notes={filteredNotes}
          chordSteps={chordSteps}
          durationSec={slicedDurationSec}
          currentTimeSec={currentTimeSec}
          isPlaying={isPlaying}
          activePitches={activePitches}
          monitorSource={monitorSource}
          onChangeMonitorSource={handleChangeMonitorSource}
          speed={speed}
          onChangeSpeed={handleChangeSpeed}
          isLooping={isLooping}
          onToggleLoop={handleToggleLoop}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onKeyPress={handleVirtualKeyPress}
          onCopyNoteList={handleCopyNoteList}
          onExportMidi={handleExportMidi}
        />
      </main>

      <footer className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>
          Song to Keyboard Notes · Powered client-side by @magenta/music OnsetsAndFrames &amp;
          TensorFlow.js
        </span>
        <span className="font-mono tabular-nums">
          229 Mel bins · 16 kHz mono · MIDI C2–C7 (36–96)
        </span>
      </footer>
    </div>
  );
}
