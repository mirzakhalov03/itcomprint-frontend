import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from './ui/Avatar';
import { LogOutIcon } from './icons';
import { SignOutDialog } from './SignOutDialog';

export function UserMenu() {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      <Avatar user={user} size="sm" />
      <span className="hidden text-sm font-medium text-white sm:inline">{user.displayName}</span>
      <button
        onClick={() => setConfirming(true)}
        title="Sign out"
        aria-label="Sign out"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 text-faint hover:text-white"
      >
        <LogOutIcon size={15} />
      </button>
      {confirming && <SignOutDialog onClose={() => setConfirming(false)} />}
    </div>
  );
}
