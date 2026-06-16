import { EventSelector } from './EventSelector';
import { UploadIcon } from './icons';

/** Light bar between the dark header and the workspace: event picker + import. */
export function EventBar({
  eventId,
  onChange,
  onImport,
}: {
  eventId: string | null;
  onChange: (id: string) => void;
  onImport: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-line bg-surface px-6 py-3.5">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-3">
        <EventSelector value={eventId} onChange={onChange} />
        <button
          onClick={onImport}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line-2 bg-white px-[18px] font-display text-sm font-semibold text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-colors hover:border-[#c8ccc2]"
        >
          <UploadIcon size={16} className="text-brand-strong" />
          Import spreadsheet
        </button>
      </div>
    </div>
  );
}
