import { AlertCircle, CheckCircle2, CircleDashed, Loader2, Play } from 'lucide-react';
import type { ModelInfo, PipelineStageStatus } from '../types/notebook';

interface PipelineStageSummary {
  id: string;
  cellTag: string;
  label: string;
  status: PipelineStageStatus;
  detail: string;
}

interface PipelineHeaderProps {
  modelStatus: PipelineStageStatus;
  modelInfo: ModelInfo | null;
  audioStatus: PipelineStageStatus;
  audioDetail: string;
  transcribeStatus: PipelineStageStatus;
  filteredNoteCount: number;
  transcribeLatencyMs: number | null;
  isPlaying: boolean;
  isPipelineBusy: boolean;
  onRunFullPipeline: () => void;
}

function StageStatusIcon({ status }: { status: PipelineStageStatus }) {
  if (status === 'loading') {
    return <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" aria-hidden="true" />;
  }
  if (status === 'ready') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" aria-hidden="true" />;
  }
  return <CircleDashed className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
}

function statusTextLabel(status: PipelineStageStatus): string {
  switch (status) {
    case 'loading':
      return 'Running';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

export function PipelineHeader({
  modelStatus,
  modelInfo,
  audioStatus,
  audioDetail,
  transcribeStatus,
  filteredNoteCount,
  transcribeLatencyMs,
  isPlaying,
  isPipelineBusy,
  onRunFullPipeline,
}: PipelineHeaderProps) {
  const stages: PipelineStageSummary[] = [
    {
      id: 'cell-1',
      cellTag: 'In [1]',
      label: 'Model',
      status: modelStatus,
      detail: modelInfo
        ? `${modelInfo.backend.toUpperCase()} · ${modelInfo.loadLatencyMs} ms`
        : modelStatus === 'loading'
          ? 'Fetching weights…'
          : 'OnsetsAndFrames',
    },
    {
      id: 'cell-2',
      cellTag: 'In [2]',
      label: 'Audio & Mel',
      status: audioStatus,
      detail: audioDetail,
    },
    {
      id: 'cell-3',
      cellTag: 'In [3]',
      label: 'Transcription',
      status: transcribeStatus,
      detail:
        transcribeStatus === 'ready'
          ? `${filteredNoteCount} notes${transcribeLatencyMs !== null ? ` · ${transcribeLatencyMs} ms` : ''}`
          : transcribeStatus === 'loading'
            ? 'Running inference…'
            : 'Awaiting audio',
    },
    {
      id: 'cell-4',
      cellTag: 'In [4]',
      label: 'Play-Along',
      status: transcribeStatus === 'ready' ? 'ready' : 'idle',
      detail: isPlaying
        ? 'Playing live'
        : transcribeStatus === 'ready'
          ? '61 keys · MIDI ready'
          : 'Waiting for notes',
    },
  ];

  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      {/* Top Bar Contract: Brand wordmark — 4 single-line nav links — 1 primary CTA */}
      <header className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        <a
          href="#top"
          className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-4 rounded"
        >
          Song to Keyboard Notes
        </a>

        <nav
          aria-label="Notebook Cells"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#cell-1"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            In [1] Model
          </a>
          <a
            href="#cell-2"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            In [2] Audio
          </a>
          <a
            href="#cell-3"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            In [3] Roll
          </a>
          <a
            href="#cell-4"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            In [4] Piano
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onRunFullPipeline}
            disabled={isPipelineBusy}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
          >
            {isPipelineBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            )}
            <span>{isPipelineBusy ? 'Processing…' : 'Run All Cells'}</span>
          </button>
        </div>
      </header>

      {/* Pipeline Overview Bar */}
      <div className="border-t border-slate-200/80 bg-[#F8FAFC]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-2 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {stages.map((stage) => (
            <a
              key={stage.id}
              href={`#${stage.id}`}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:border-slate-300 transition-colors min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <StageStatusIcon status={stage.status} />
                <div className="flex items-center gap-1.5 min-w-0 text-xs">
                  <span className="font-mono font-medium text-slate-500 shrink-0">
                    {stage.cellTag}
                  </span>
                  <span className="font-medium text-slate-800 truncate">{stage.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums shrink-0">
                <span
                  className={
                    stage.status === 'ready'
                      ? 'text-emerald-700 font-medium'
                      : stage.status === 'loading'
                        ? 'text-blue-700 font-medium'
                        : stage.status === 'error'
                          ? 'text-red-700 font-medium'
                          : 'text-slate-500'
                  }
                >
                  {statusTextLabel(stage.status)}
                </span>
                <span className="hidden xl:inline text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span className="hidden xl:inline text-slate-500 max-w-[110px] truncate">
                  {stage.detail}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
