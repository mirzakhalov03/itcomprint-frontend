import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useUpdateName } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';

export function OnboardingPage() {
  const { user, isLoading } = useAuth();
  const update = useUpdateName();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboardedAt) return <Navigate to="/app" replace />;

  // Pre-fill from the Google name the first time the field is empty.
  const value = name || user.displayName;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate(trimmed, { onSuccess: () => navigate('/app', { replace: true }) });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-surface px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-white p-8"
      >
        <h1 className="font-display text-xl font-bold text-ink">Welcome 👋</h1>
        <p className="mt-1.5 text-sm text-muted">
          Confirm the name we should show as the event author.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setName(e.target.value)}
          className="mt-5 w-full rounded-lg border border-line px-3 py-2.5 text-ink outline-none focus:border-brand"
          placeholder="Your name"
        />
        <Button
          type="submit"
          disabled={update.isPending || !value.trim()}
          className="mt-4 w-full rounded-lg py-2.5 text-sm"
        >
          {update.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </div>
  );
}
