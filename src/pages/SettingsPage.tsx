import { useState } from 'react';
import { useAuth, useLogout, useUpdateName } from '../hooks/useAuth';
import { toast } from '../store/toastStore';

export function SettingsPage() {
  const { user } = useAuth();
  const update = useUpdateName();
  const logout = useLogout();
  const [name, setName] = useState('');

  if (!user) return null;
  const value = name || user.displayName;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate(trimmed, { onSuccess: () => toast('Name updated') });
  };

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-5 font-display text-xl font-bold text-ink">Settings</h1>

      <form onSubmit={save} className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-3">
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-display text-base font-bold text-ink">{user.displayName}</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
        </div>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">
            Display name (shown as event author)
          </span>
          <input
            value={value}
            onChange={(e) => setName(e.target.value)}
            className="h-[42px] rounded-[10px] border border-line-2 bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          disabled={update.isPending || !value.trim()}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-brand px-5 font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="mt-4 rounded-2xl border border-line bg-white p-6">
        <div className="font-display text-base font-bold text-ink">Sign out</div>
        <div className="mt-1 text-sm text-muted">End your session on this device.</div>
        <button
          onClick={() => logout.mutate()}
          className="mt-4 inline-flex h-11 items-center rounded-full border border-danger px-5 font-display text-sm font-bold text-danger transition-colors hover:bg-danger hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
