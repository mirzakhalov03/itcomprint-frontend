import { useAuth, useLogout } from '../hooks/useAuth';
import { Avatar } from './ui/Avatar';

export function UserMenu() {
  const { user } = useAuth();
  const logout = useLogout();
  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      <Avatar user={user} size="sm" />
      <span className="hidden text-sm font-medium text-white sm:inline">{user.displayName}</span>
      <button
        onClick={() => logout.mutate()}
        className="rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-faint hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
