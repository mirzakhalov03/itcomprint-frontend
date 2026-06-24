import { cn } from '../../lib/cn';
import type { AuthUser } from '../../types';

const SIZES = {
  sm: { box: 'h-8 w-8', text: 'text-sm' },
  lg: { box: 'h-12 w-12', text: 'text-base' },
} as const;

/** The signed-in user's photo, falling back to their initial on a brand chip. */
export function Avatar({
  user,
  size = 'sm',
}: {
  user: Pick<AuthUser, 'picture' | 'displayName'>;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];

  if (user.picture) {
    return (
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        className={cn('rounded-full object-cover', s.box)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-brand font-bold text-white',
        s.box,
        s.text,
      )}
    >
      {user.displayName.charAt(0).toUpperCase()}
    </div>
  );
}
