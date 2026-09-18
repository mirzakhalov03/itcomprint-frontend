import { useState } from 'react';
import { ChevronDownIcon } from './icons';
import type { SheetIssue } from '../types';

const REASON_LABEL: Record<SheetIssue['reason'], string> = {
  missing_name: 'no Full Name',
  missing_id: 'no Reg. Number',
  duplicate_id: 'repeats an earlier Reg. Number',
};

/** Tells operators which sheet rows didn't make it onto the roster, so a skip never looks like a broken sync. */
export function SheetIssuesNotice({ issues }: { issues: SheetIssue[] }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;

  const count = issues.length;
  return (
    <div className="border-b border-line-3 bg-surface-2 px-4 py-2 text-[13px] sm:px-5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 font-display font-semibold text-muted transition-colors hover:text-ink"
      >
        <ChevronDownIcon
          size={14}
          className={`transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
        />
        {count} sheet {count === 1 ? "row isn't" : "rows aren't"} on the roster — fix them in the
        sheet
      </button>
      {open && (
        <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto pl-5 text-muted">
          {issues.map((i) => (
            <li key={i.row}>
              <span className="font-semibold text-ink">Row {i.row}</span>
              {(i.registrantId || i.fullName) && (
                <span className="text-faint"> · {i.registrantId || i.fullName}</span>
              )}{' '}
              — {REASON_LABEL[i.reason]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
