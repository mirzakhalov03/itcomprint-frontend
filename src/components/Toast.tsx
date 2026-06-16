import { useToastStore } from '../store/toastStore';

export function Toast() {
  const message = useToastStore((s) => s.message);
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed bottom-6 left-1/2 z-[200] flex h-11 -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink-2 px-[18px] font-body text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,.3)]"
    >
      <span className="h-2 w-2 rounded-full bg-brand" />
      {message}
    </div>
  );
}
