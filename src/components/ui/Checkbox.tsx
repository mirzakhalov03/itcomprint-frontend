import { cn } from '../../lib/cn';
import { CheckIcon } from '../icons';

/** Square brand checkbox used for the attendee rows and the select-all header. */
export function Checkbox({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md transition-all',
        checked ? 'border border-brand bg-brand' : 'border-[1.5px] border-[#c8ccc2] bg-white',
      )}
    >
      {checked && <CheckIcon size={13} className="text-white" strokeWidth={3.4} />}
    </button>
  );
}
