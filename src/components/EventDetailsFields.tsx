import { Input } from './ui/Input';

/** Event name + date pair used by every create/edit event dialog. */
export function EventDetailsFields({
  name,
  date,
  onNameChange,
  onDateChange,
}: {
  name: string;
  date: string;
  onNameChange: (value: string) => void;
  onDateChange: (value: string) => void;
}) {
  return (
    <div className="mt-[18px] grid grid-cols-2 gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Event name</span>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. DevFest Tashkent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Event date</span>
        <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
      </label>
    </div>
  );
}
