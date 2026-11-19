import { useState } from 'react';
import { Check, Copy, Cpu, Loader2, Play, RotateCw } from 'lucide-react';
import type { ModelInfo, PipelineStageStatus } from '../types/notebook';
import { ONSETS_AND_FRAMES_CHECKPOINT } from '../ml/magentaTranscription';

interface CellModelLoaderProps {
  status: PipelineStageStatus;
  modelInfo: ModelInfo | null;
  error: string | null;
  onLoadModel: () => void;
}

const LOADER_SNIPPET = `import * as tf from '@tensorflow/tfjs';
import { OnsetsAndFrames } from '@magenta/music/esm/transcription';

const CHECKPOINT_URL =
  '${ONSETS_AND_FRAMES_CHECKPOINT}';

await tf.ready();
const model = new OnsetsAndFrames(CHECKPOINT_URL);
await model.initialize(); // 229 Mel bins @ 16 kHz mono -> MIDI 21..108`;

export function CellModelLoader({
  status,
  modelInfo,
  error,
  onLoadModel,
}: CellModelLoaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(LOADER_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in some contexts
    }
  };

  return (
    <section
      id="cell-1"
      className="scroll-mt-28 rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Cell Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-xs font-semibold text-blue-600 shrink-0">In [1]</span>
          <h2 className="font-display text-lg font-semibold text-slate-900 tracking-tight">
            Load Pretrained Onsets &amp; Frames Model
          </h2>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="text-xs font-mono tabular-nums text-slate-500 hidden sm:inline">
            {status === 'ready' && modelInfo
              ? `Ready · ${modelInfo.backend.toUpperCase()} · ${modelInfo.loadLatencyMs} ms`
              : status === 'loading'
                ? 'Loading checkpoint weights…'
                : status === 'error'
                  ? 'Load failed'
                  : 'On-demand or auto-loaded at In [3]'}
          </span>

          <button
            type="button"
            onClick={onLoadModel}
            disabled={status === 'loading'}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
          >
            {status === 'loading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" aria-hidden="true" />
            ) : status === 'ready' ? (
              <RotateCw className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5 text-blue-600 fill-current" aria-hidden="true" />
            )}
            <span>
              {status === 'loading'
                ? 'Loading Model…'
                : status === 'ready'
                  ? 'Model Loaded'
                  : 'Load Model'}
            </span>
          </button>
        </div>
      </div>

      {/* Cell Body */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* TypeScript Loader Snippet */}
        <div className="lg:col-span-7 flex flex-col rounded-lg border border-slate-800 bg-[#0F172A] overflow-hidden">
          <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">model-loader.ts · @magenta/music</span>
            <button
              type="button"
              onClick={handleCopySnippet}
              className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs leading-relaxed font-mono text-slate-100 overflow-x-auto flex-1">
            <code>{LOADER_SNIPPET}</code>
          </pre>
        </div>

        {/* Model Specifications & Runtime Telemetry */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-[#F8FAFC] p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-200 pb-2">
              <span className="font-medium text-slate-700 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                Runtime &amp; Model Specification
              </span>
              <span
                className={`font-mono font-medium ${
                  status === 'ready'
                    ? 'text-emerald-700'
                    : status === 'loading'
                      ? 'text-blue-700'
                      : status === 'error'
                        ? 'text-red-700'
                        : 'text-slate-500'
                }`}
              >
                {status === 'ready'
                  ? 'Initialized'
                  : status === 'loading'
                    ? 'Initializing'
                    : status === 'error'
                      ? 'Error'
                      : 'Not Loaded'}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">TF.js Backend</dt>
                <dd className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                  {modelInfo ? modelInfo.backend.toUpperCase() : 'WebGL / CPU'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Load Latency</dt>
                <dd className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                  {modelInfo ? `${modelInfo.loadLatencyMs} ms` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Mel Spectrogram Input</dt>
                <dd className="font-mono text-xs sm:text-sm font-medium text-slate-900 tabular-nums mt-0.5">
                  229 bins · 16 kHz mono
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">88-Key Pitch Range</dt>
                <dd className="font-mono text-xs sm:text-sm font-medium text-slate-900 tabular-nums mt-0.5">
                  A0 (21) – C8 (108)
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200 pt-3">
            Runs entirely locally in your browser via TensorFlow.js. Note onset, frame activation,
            and key velocity CNN+RNN heads execute client-side without sending audio to external AI
            APIs.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-5 mb-5 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-xs sm:text-sm text-red-800"
        >
          {error}
        </div>
      )}
    </section>
  );
}
