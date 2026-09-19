import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const SIZES = {
  sm: 'max-w-[380px]',
  md: 'max-w-[420px]',
  lg: 'max-w-[520px]',
  xl: 'max-w-[760px]',
} as const;

/**
 * Modal shell. Portalled to <body> because a transformed ancestor (the sliding sidebar)
 * would trap `fixed`. Escape and backdrop close it unless `busy` (mid-save).
 */
export function Dialog({
  title,
  description,
  size = 'md',
  busy = false,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof SIZES;
  busy?: boolean;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  useEscapeKey(onClose, !busy);

  return createPortal(
    <div
      onClick={() => !busy && onClose()}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'animate-dlg-in my-auto w-full rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7',
          SIZES[size],
        )}
      >
        <div id={titleId} className="font-display text-xl font-bold text-ink">
          {title}
        </div>
        {description && <div className="mt-1.5 text-sm text-muted">{description}</div>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
