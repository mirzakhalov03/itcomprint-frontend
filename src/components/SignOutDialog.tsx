import { createPortal } from 'react-dom';
import { useLogout } from '../hooks/useAuth';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { Button } from './ui/Button';

export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const logout = useLogout();

  async function handleConfirm() {
    try {
      await logout.mutateAsync();
      onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't sign out — try again."));
    }
  }

  // Portalled to <body> — this can be opened from the sidebar's user menu,
  // and the sidebar's slide-in transform gives it a containing block that
  // would otherwise trap a `fixed` overlay inside the sidebar's own box.
  return createPortal(
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-dlg-in my-auto w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7"
      >
        <div className="font-display text-xl font-bold text-ink">Sign out?</div>
        <div className="mt-1.5 text-sm text-muted">
          You'll be signed out on this device and need to sign in again to continue.
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={logout.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
