import { useAuth, useLogout } from '../hooks/useAuth';

export function UserMenu() {
  const { user } = useAuth();
  const logout = useLogout();
  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      {user.picture ? (
        <img
          src={user.picture}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      )}
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
