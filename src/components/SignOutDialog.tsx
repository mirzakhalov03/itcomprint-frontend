import { useLogout } from '../hooks/useAuth';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';

export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const logout = useLogout();
  return (
    <ConfirmDialog
      size="sm"
      title="Sign out?"
      description="You'll be signed out on this device and need to sign in again to continue."
      confirmLabel="Sign out"
      pendingLabel="Signing out…"
      errorFallback="Couldn't sign out — try again."
      onConfirm={async () => {
        try {
          await logout.mutateAsync();
        } catch (err) {
          // Local state is already cleared (useLogout's onSettled) even though this
          // rejected — toast but don't rethrow, so the dialog still closes instead of
          // dead-ending on an already-invalid session.
          toast(errMessage(err, "Couldn't sign out — try again."));
        }
      }}
      onClose={onClose}
    />
  );
}
