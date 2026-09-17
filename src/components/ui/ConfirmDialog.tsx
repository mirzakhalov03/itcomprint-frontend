import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { toast } from '../../store/toastStore';
import { errMessage } from '../../lib/errors';

/** Title + message + Cancel/Confirm. The caller's onConfirm does the work and any success toast. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  errorFallback,
  size = 'md',
  onConfirm,
  onClose,
}: {
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  errorFallback: string;
  size?: 'sm' | 'md';
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast(errMessage(err, errorFallback));
      setPending(false);
    }
  }

  return (
    <Dialog
      title={title}
      description={description}
      size={size}
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={pending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
