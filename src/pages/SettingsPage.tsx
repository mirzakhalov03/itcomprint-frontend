import { useState } from 'react';
import { useAuth, useLogout, useUpdateName } from '../hooks/useAuth';
import { toast } from '../store/toastStore';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

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
          <Avatar user={user} size="lg" />
          <div>
            <div className="font-display text-base font-bold text-ink">{user.displayName}</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
        </div>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">
            Display name (shown as event author)
          </span>
          <Input value={value} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button
          type="submit"
          disabled={update.isPending || !value.trim()}
          className="mt-4 h-11 rounded-full px-5 text-sm"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <div className="mt-4 rounded-2xl border border-line bg-white p-6">
        <div className="font-display text-base font-bold text-ink">Sign out</div>
        <div className="mt-1 text-sm text-muted">End your session on this device.</div>
        <Button
          variant="danger"
          onClick={() => logout.mutate()}
          className="mt-4 h-11 rounded-full px-5 text-sm"
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
