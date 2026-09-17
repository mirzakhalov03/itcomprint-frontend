import { useState, type InputHTMLAttributes } from 'react';

interface NumberFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: number;
  onChange: (value: number) => void;
}

/**
 * Numeric input that tracks its own text while typing, so clearing the field
 * doesn't snap to "0" and a fresh digit doesn't get glued after a stale one
 * (native behavior when a controlled number input re-renders mid-keystroke).
 * Only commits to `onChange` once the text parses to a real number; an empty
 * or invalid blur reverts the display to the last committed value.
 */
export function NumberField({ value, onChange, min = 0, ...props }: NumberFieldProps) {
  const [prevValue, setPrevValue] = useState(value);
  const [text, setText] = useState(String(value));

  // Sync display text when `value` changes from outside (e.g. loading a different
  // template) without clobbering what the user is mid-typing — see React's
  // "adjusting state when a prop changes" pattern (render-phase, not an effect).
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  return (
    <input
      type="number"
      min={min}
      value={text}
      onChange={(e) => {
        // Strip "-" outright rather than clamping on blur — a badge dimension
        // or font size is never negative, so the character shouldn't even show.
        const raw = e.target.value.replace('-', '');
        setText(raw);
        const parsed = Number(raw);
        if (raw !== '' && Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => setText(String(value))}
      {...props}
    />
  );
}
