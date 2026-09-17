import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useCreateEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { todayLocal } from '../lib/format';
import { ChevronDownIcon, UploadIcon } from './icons';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { EventDetailsFields } from './EventDetailsFields';
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
  const [eventDate, setEventDate] = useState(todayLocal);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const createEvent = useCreateEvent();

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
        setRows(json);
        const cols = json.length ? Object.keys(json[0]) : [];
        setColumns(cols);
        setNameCol((prev) => prev || cols.find((c) => /name/i.test(c)) || cols[0] || '');
      } catch {
        setRows([]);
        setColumns([]);
        setFileName('');
        toast("Couldn't read that file — use an .xlsx, .xls or .csv spreadsheet.");
      }
    };
    reader.onerror = () => toast("Couldn't read that file — try again.");
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

    try {
      const created = await createEvent.mutateAsync({
        name: eventName.trim(),
        date: eventDate,
        attendees,
      });
      toast('Event imported');
      if (onImported) onImported(created);
      else onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't import that event — try again."));
    }
  }

  const canImport = !!eventName.trim() && !!nameCol && rows.length > 0;

  return (
    <Dialog
      size="lg"
      title="Import event spreadsheet"
      description="Upload a CSV or XLSX of attendees."
      busy={createEvent.isPending}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport || createEvent.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {createEvent.isPending ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="hidden"
      />
      <button
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`mt-[18px] flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-[26px] transition-all ${
          fileName || dragging
            ? 'border-brand bg-brand-tint'
            : 'border-line-2 bg-surface hover:border-brand hover:bg-brand-tint'
        }`}
      >
        <UploadIcon size={26} strokeWidth={2} className="text-brand-strong" />
        <span className="font-display text-sm font-semibold text-ink-3">
          {fileName || 'Drop spreadsheet here'}
        </span>
        <span className="text-xs text-faint">Click to browse — CSV, XLSX up to 5MB</span>
      </button>

      <EventDetailsFields
        name={eventName}
        date={eventDate}
        onNameChange={setEventName}
        onDateChange={setEventDate}
      />

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
    </Dialog>
  );
}
