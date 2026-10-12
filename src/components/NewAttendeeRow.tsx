import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useAddAttendee } from '../hooks/useAttendees';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { CloseIcon } from './icons';
import { Button } from './ui/Button';
import type { Attendee } from '../types';

/** Blank inline row for a walk-in: name only, saved to our roster (never the Google Sheet). */
export function NewAttendeeRow({
  eventId,
  onAdded,
  onClose,
}: {
  eventId: string;
  onAdded: (a: Attendee) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const rowRef = useRef<HTMLFormElement>(null);
  const add = useAddAttendee(eventId);
  const canSave = !!name.trim() && !add.isPending;

  // Bring the row into view if the list was scrolled; scroll-mt clears the sticky toolbar.
  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  async function save() {
    if (!canSave) return;
    try {
      const attendee = await add.mutateAsync(name.trim());
      onClose();
      onAdded(attendee);
    } catch (err) {
      toast(errMessage(err, "Couldn't add that attendee — try again."));
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // don't also close the print panel behind
    onClose();
  }

  return (
    <form
      ref={rowRef}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={onKeyDown}
      className="animate-fade-in flex h-14 scroll-mt-40 items-center gap-3 border-b border-line-3 bg-brand-tint px-4 sm:h-13 sm:gap-4 sm:px-5"
      style={{ borderLeft: '3px solid var(--color-brand)' }}
    >
      {/* Spacers keep the name aligned with the rows below (checkbox + ID columns). */}
      <span className="w-5.5 shrink-0" aria-hidden />
      <span className="w-8 shrink-0" aria-hidden />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={add.isPending}
        placeholder="Full name"
        aria-label="New attendee's full name"
        maxLength={120}
        autoComplete="off"
        className="h-9.5 min-w-0 flex-1 rounded-[9px] border border-brand bg-white px-3 font-display text-sm font-semibold text-ink outline-none ring-4 ring-brand/15 placeholder:font-normal placeholder:text-faint"
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onClose}
          disabled={add.isPending}
          aria-label="Cancel"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:text-ink"
        >
          <CloseIcon size={15} />
        </button>
        <Button
          type="submit"
          disabled={!canSave}
          className="h-9.5 rounded-[9px] px-4 text-sm sm:px-5"
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
