import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useCreateEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { ChevronDownIcon, UploadIcon } from './icons';
import type { AppEvent, NewAttendee } from '../types';

type Row = Record<string, string>;

export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (event: AppEvent) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [nameCol, setNameCol] = useState('');
  const [fileName, setFileName] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const fileInput = useRef<HTMLInputElement>(null);
  const createEvent = useCreateEvent();

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
      setRows(json);
      const cols = json.length ? Object.keys(json[0]) : [];
      setColumns(cols);
      setNameCol((prev) => prev || cols.find((c) => /name/i.test(c)) || cols[0] || '');
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    const attendees: NewAttendee[] = rows
      .map((row) => {
        const fullName = String(row[nameCol] ?? '').trim();
        const extra: Record<string, string> = {};
        for (const col of columns) {
          if (col !== nameCol && row[col] !== '') extra[col] = String(row[col]);
        }
        return { fullName, extra };
      })
      .filter((a) => a.fullName);

    const created = await createEvent.mutateAsync({
      name: eventName.trim(),
      date: eventDate,
      attendees,
    });
    toast('Event imported');
    if (onImported) onImported(created);
    else onClose();
  }

  const canImport = !!eventName.trim() && !!nameCol && rows.length > 0;
  const inputClass =
    'h-[42px] rounded-[10px] border border-line-2 bg-surface px-3 text-sm text-ink outline-none placeholder:text-faint';

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-dlg-in my-auto w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7"
      >
        <div className="font-display text-xl font-bold text-ink">Import event spreadsheet</div>
        <div className="mt-1 text-sm text-muted">Upload a CSV or XLSX of attendees.</div>

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
        <button
          onClick={() => fileInput.current?.click()}
          className={`mt-[18px] flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-[26px] transition-all ${
            fileName
              ? 'border-brand bg-brand-tint'
              : 'border-[#c8ccc2] bg-surface hover:border-brand hover:bg-brand-tint'
          }`}
        >
          <UploadIcon size={26} strokeWidth={2} className="text-brand-strong" />
          <span className="font-display text-sm font-semibold text-ink-3">
            {fileName || 'Drop spreadsheet here'}
          </span>
          <span className="text-xs text-faint">Click to browse — CSV, XLSX up to 5MB</span>
        </button>

        <div className="mt-[18px] grid grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Event name</span>
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. DevFest Tashkent"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Event date</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="mt-3.5 flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">Name column</span>
          <div className="relative">
            <select
              value={nameCol}
              onChange={(e) => setNameCol(e.target.value)}
              disabled={columns.length === 0}
              className="h-[42px] w-full appearance-none rounded-[10px] border border-line-2 bg-surface pl-3 pr-9 text-sm text-ink outline-none disabled:text-faint"
            >
              {columns.length === 0 ? (
                <option value="">Upload a file first</option>
              ) : (
                columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              )}
            </select>
            <ChevronDownIcon
              size={16}
              className="pointer-events-none absolute right-3 top-[13px] text-muted"
            />
          </div>
        </label>

        <div className="mt-2.5 text-xs text-faint">
          {canImport
            ? `${rows.length} rows detected · other columns kept for search`
            : 'Add a file and event name to continue'}
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="h-11 rounded-[10px] border border-line-2 px-5 font-display text-sm font-semibold text-ink-3 transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport || createEvent.isPending}
            className="h-11 rounded-[10px] bg-brand px-6 font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-[#c8ccc2]"
          >
            {createEvent.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
