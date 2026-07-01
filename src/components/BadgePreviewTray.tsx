import { usePreviewStore } from '../store/previewStore';
import { DownloadIcon, NodeMesh } from './icons';
import type { PrintJob } from '../printer/PrinterAdapter';

function downloadTspl(job: PrintJob) {
  const blob = new Blob([job.tspl], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `badge-${job.name.replace(/\s+/g, '_')}.tspl.bin`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BadgePreviewTray() {
  const { jobs, clear } = usePreviewStore();
  if (jobs.length === 0) return null;

  return (
    <div className="relative shrink-0 overflow-hidden border-t-[3px] border-brand bg-ink px-4 pb-[18px] pt-3.5 sm:px-6">
      <NodeMesh className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />

      <div className="relative mx-auto max-w-[1120px]">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-[13px] font-bold uppercase tracking-[.06em] text-white">
              Badge preview
            </span>
            <span className="inline-flex h-5 items-center rounded-full bg-ink-2 px-2 font-display text-[11px] font-bold text-brand-line">
              {jobs.length}
            </span>
            <span className="text-xs text-faint">Preview mode — printer not sending</span>
          </div>
          <button
            onClick={clear}
            className="h-8 rounded-lg border border-ink-3 px-3.5 font-display text-xs font-semibold text-[#c8ccc2] transition-colors hover:border-muted hover:text-white"
          >
            Clear all
          </button>
        </div>

        <div className="flex gap-3.5 overflow-x-auto px-0.5 pb-2 pt-1">
          {jobs.map((job, i) => (
            <div key={i} className="animate-badge-rise w-[220px] shrink-0">
              <div className="flex h-[165px] w-[220px] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-[0_10px_26px_rgba(0,0,0,.4)]">
                <div className="h-1.5 bg-brand" />
                <div className="flex flex-1 flex-col items-center justify-center px-3 py-2">
                  {job.eventName && (
                    <span className="mb-1 text-center font-display text-[9px] font-semibold tracking-[.1em] text-faint">
                      {job.eventName}
                    </span>
                  )}
                  <img
                    src={job.previewDataUrl}
                    alt={job.name}
                    className="max-h-full max-w-full object-contain"
                    style={{
                      aspectRatio: `${job.labelWidthMm} / ${job.labelHeightMm}`,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={() => downloadTspl(job)}
                className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-ink-3 font-display text-xs font-semibold text-[#c8ccc2] transition-colors hover:border-brand hover:text-white"
              >
                <DownloadIcon size={13} />
                Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
