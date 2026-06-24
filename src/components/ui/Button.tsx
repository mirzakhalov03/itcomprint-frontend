import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';

// Variants carry only the colour treatment — the part that was copy-pasted (and
// drifting) across the app. Size, radius and layout stay in each caller's
// `className`, because those genuinely differ by placement (pill vs. card button,
// header pill vs. row action) and shouldn't be flattened into one shape.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  secondary: 'border border-line-2 text-ink-3 hover:bg-surface',
  outline: 'border border-brand-line bg-white text-brand-deep hover:bg-brand-tint',
  danger: 'border border-danger text-danger hover:bg-danger hover:text-white',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-display font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
