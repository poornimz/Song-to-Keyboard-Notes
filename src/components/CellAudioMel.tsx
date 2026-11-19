import { useRef, useState } from 'react';
import { Globe, Loader2, Music2, Play, Square, Upload } from 'lucide-react';
import type {
  AnalysisWindowSec,
  AudioInputMethod,
  BuiltInClipId,
  PipelineStageStatus,
} from '../types/notebook';
import { BUILTIN_CLIPS } from '../audio/builtInClips';
import { MelSpectrogramCanvas } from './MelSpectrogramCanvas';

interface CellAudioMelProps {
  inputMethod: AudioInputMethod;
  onChangeInputMethod: (method: AudioInputMethod) => void;
  audioStatus: PipelineStageStatus;
  audioError: string | null;
  clipTitle: string;
  sourceDurationSec: number;
  sourceSampleRate: number;
  offsetSec: number;
  onChangeOffsetSec: (offset: number) => void;
  windowSec: AnalysisWindowSec;
  onChangeWindowSec: (win: AnalysisWindowSec) => void;
  slicedDurationSec: number;
  melSpec: Float32Array[] | null;
  activeBuiltInId: BuiltInClipId | null;
  isPreviewPlaying: boolean;
  previewTimeSec: number;
  onUploadFile: (file: File) => void;
  onFetchAudioUrl: (url: string) => void;
  onSelectBuiltIn: (id: BuiltInClipId) => void;
  onTogglePreviewClip: () => void;
}

const ANALYSIS_WINDOWS: ReadonlyArray<{ sec: AnalysisWindowSec; label: string }> = [
  { sec: 6, label: '6s' },
  { sec: 10, label: '10s' },
  { sec: 15, label: '15s' },
  { sec: 25, label: '25s' },
  { sec: 60, label: '1m' },
  { sec: 120, label: '2m' },
];

export function CellAudioMel({
  inputMethod,
  onChangeInputMethod,
  audioStatus,
  audioError,
  clipTitle,
  sourceDurationSec,
  sourceSampleRate,
  offsetSec,
  onChangeOffsetSec,
  windowSec,
  onChangeWindowSec,
  slicedDurationSec,
  melSpec,
  activeBuiltInId,
  isPreviewPlaying,
  previewTimeSec,
  onUploadFile,
  onFetchAudioUrl,
  onSelectBuiltIn,
  onTogglePreviewClip,
}: CellAudioMelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const maxOffset = Math.max(0, Number((sourceDurationSec - Math.min(windowSec, sourceDurationSec)).toFixed(2)));
  const hasAudio = sourceDurationSec > 0 && melSpec !== null;

  const handleFileSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUploadFile(files[0]);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    onFetchAudioUrl(urlInput.trim());
  };

  return (
    <section
      id="cell-2"
      className="scroll-mt-28 rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Cell Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-xs font-semibold text-blue-600 shrink-0">In [2]</span>
          <h2 className="font-display text-lg font-semibold text-slate-900 tracking-tight">
            Load Song Audio, Slice Clip &amp; Render Mel Spectrogram
          </h2>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-500">
          {hasAudio ? (
            <>
              <span className="text-slate-700 font-medium truncate max-w-[200px]">{clipTitle}</span>
              <span aria-hidden="true">·</span>
              <span>{sourceDurationSec.toFixed(1)}s total</span>
              <span aria-hidden="true">·</span>
              <span>{(sourceSampleRate / 1000).toFixed(1)} kHz</span>
            </>
          ) : (
            <span>No audio decoded yet</span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Source Selection Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Audio input source"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMethod === 'builtin'}
              onClick={() => onChangeInputMethod('builtin')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                inputMethod === 'builtin'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Music2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Built-In Piano Clips</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMethod === 'upload'}
              onClick={() => onChangeInputMethod('upload')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                inputMethod === 'upload'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload Song File</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMethod === 'url'}
              onClick={() => onChangeInputMethod('url')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                inputMethod === 'url'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Direct Audio URL</span>
            </button>
          </div>

          {audioStatus === 'loading' && (
            <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Decoding audio &amp; computing 229-bin Mel spectrogram…</span>
            </div>
          )}
        </div>

        {/* Input Method Panel */}
        {inputMethod === 'upload' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileSelected(e.dataTransfer.files);
            }}
            className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-blue-600 bg-blue-50/50'
                : 'border-slate-300 bg-[#F8FAFC] hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,audio/*"
              onChange={(e) => handleFileSelected(e.target.files)}
              className="hidden"
            />
            <p className="text-sm font-medium text-slate-800">
              Drop a song file here or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2 cursor-pointer"
              >
                browse local audio
              </button>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports .mp3, .wav, .m4a, and .ogg · Decoded locally via Web Audio API
            </p>
          </div>
        )}

        {inputMethod === 'url' && (
          <form onSubmit={handleUrlSubmit} className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/piano-sample.mp3"
                aria-label="Direct audio file URL"
                className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 font-mono"
              />
              <button
                type="submit"
                disabled={audioStatus === 'loading' || !urlInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {audioStatus === 'loading' ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Globe className="w-4 h-4" aria-hidden="true" />
                )}
                <span>Fetch Audio</span>
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Fetched securely via <span className="font-mono">/api/fetch-audio</span> (25 MB max,
              direct .mp3 / .wav / .m4a / .ogg links only; HTML webpages and DRM streaming links are
              rejected).
            </p>
          </form>
        )}

        {inputMethod === 'builtin' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BUILTIN_CLIPS.map((clip) => {
              const selected = activeBuiltInId === clip.id && hasAudio;
              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => onSelectBuiltIn(clip.id)}
                  disabled={audioStatus === 'loading'}
                  className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                    selected
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 bg-[#F8FAFC] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-slate-900">
                      {clip.title}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-500 shrink-0">
                      {clip.durationSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{clip.subtitle}</p>
                  <span
                    className={`inline-block mt-2.5 text-xs font-medium ${
                      selected ? 'text-blue-700' : 'text-slate-600'
                    }`}
                  >
                    {selected ? 'Active AudioBuffer' : 'Render OfflineAudioContext'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {audioError && (
          <div
            role="alert"
            className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-xs sm:text-sm text-red-800"
          >
            {audioError}
          </div>
        )}

        {/* Clip Slicing & Preview Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-1 border-t border-slate-200">
          {/* Start Offset Slider */}
          <div className="md:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="clip-offset-slider" className="font-medium text-slate-700">
                Clip Start Offset
              </label>
              <span className="font-mono tabular-nums text-slate-900 font-medium">
                {offsetSec.toFixed(1)}s / {sourceDurationSec.toFixed(1)}s
              </span>
            </div>
            <input
              id="clip-offset-slider"
              type="range"
              min={0}
              max={maxOffset || 0}
              step={0.5}
              value={Math.min(offsetSec, maxOffset)}
              disabled={!hasAudio || maxOffset <= 0}
              onChange={(e) => onChangeOffsetSec(Number(e.target.value))}
              className="studio-slider w-full disabled:opacity-40"
            />
          </div>

          {/* Analysis Window Selector */}
          <div className="md:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Analysis Window</span>
              <span className="font-mono tabular-nums text-slate-500">
                {hasAudio
                  ? `${slicedDurationSec.toFixed(2)}s active`
                  : windowSec >= 60
                    ? `${windowSec / 60}m max`
                    : `${windowSec}s max`}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200">
              {ANALYSIS_WINDOWS.map(({ sec, label }) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onChangeWindowSec(sec)}
                  className={`py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    windowSec === sec
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Play / Stop Clip Button */}
          <div className="md:col-span-2 flex items-end justify-end">
            <button
              type="button"
              onClick={onTogglePreviewClip}
              disabled={!hasAudio}
              className={`w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isPreviewPlaying
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-900'
              }`}
            >
              {isPreviewPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>Stop Clip</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-blue-600" aria-hidden="true" />
                  <span>Play Clip</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 229-bin Mel Spectrogram Canvas */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              229-Bin Log-Mel Spectrogram (preprocessAudio · 16 kHz · Hop 512)
            </span>
            <span className="font-mono tabular-nums">
              {melSpec
                ? `Shape: [${melSpec.length} frames × ${melSpec[0]?.length ?? 229} bins]`
                : 'Shape: [0 × 229]'}
            </span>
          </div>
          <MelSpectrogramCanvas
            melSpec={melSpec}
            durationSec={slicedDurationSec || windowSec}
            currentTimeSec={previewTimeSec}
            isPlaying={isPreviewPlaying}
          />
        </div>
      </div>
    </section>
  );
}
