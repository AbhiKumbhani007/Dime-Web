import { toast } from 'sonner'

export interface ToastActionOptions {
  label: string
  onClick: () => void
  duration?: number
}

/** Shows a success toast. */
export function toastSuccess(message: string): void {
  toast.success(message)
}

/** Shows an error toast. */
export function toastError(message: string): void {
  toast.error(message)
}

/**
 * Shows an action toast with a labeled button (used for undo-style actions).
 * Default duration is 5000ms.
 */
export function toastAction(message: string, options: ToastActionOptions): string | number {
  const { label, onClick, duration = 5000 } = options
  return toast(message, {
    duration,
    action: {
      label,
      onClick,
    },
  })
}
