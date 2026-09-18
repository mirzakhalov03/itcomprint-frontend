import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../hooks/useEscapeKey';

/**
 * Bottom sheet for handheld screens: slides up over a scrim, capped below full height
 * so the page behind stays visible. Children own their layout (flex column, own scroll).
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeKey(onClose);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col justify-end">
      <div onClick={onClose} className="animate-fade-in absolute inset-0 bg-ink/55" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="animate-sheet-up relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-12px_40px_rgba(0,0,0,.25)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
