import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** Standard form input — the boxed control used in dialogs and settings. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-[42px] rounded-[10px] border border-line-2 bg-surface px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand',
        className,
      )}
      {...props}
    />
  );
}
