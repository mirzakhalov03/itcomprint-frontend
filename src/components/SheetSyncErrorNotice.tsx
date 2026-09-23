/** Stays up while the last sheet pull failed — the roster on screen may be stale. */
export function SheetSyncErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-b border-line-3 bg-surface-2 px-4 py-2 text-[13px] font-semibold text-danger sm:px-5"
    >
      Sheet sync failed: {message}
    </div>
  );
}
