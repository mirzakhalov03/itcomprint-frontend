import { useToastStore } from '../store/toastStore';

export function Toast() {
  const message = useToastStore((s) => s.message);
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-[200] flex min-h-11 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-3xl bg-ink-2 px-[18px] py-2.5 font-body text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,.3)]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
      {message}
    </div>
  );
}
