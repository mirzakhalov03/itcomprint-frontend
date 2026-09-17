import { useLogout } from '../hooks/useAuth';
import { ConfirmDialog } from './ui/ConfirmDialog';

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
      onConfirm={() => logout.mutateAsync()}
      onClose={onClose}
    />
  );
}
