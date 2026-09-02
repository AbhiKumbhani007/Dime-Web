'use client'

import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Inline banner for a failed submit, distinct from per-field validation. */
export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[11px] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3.5 py-3"
    >
      <TriangleAlert aria-hidden className="mt-px h-4 w-4 shrink-0 text-destructive" />
      <span className="text-[12.5px]/[1.5] font-medium text-destructive">{message}</span>
    </div>
  )
}

const FIELD_CLASS =
  'h-[46px] w-full rounded-[11px] border bg-background px-3.5 text-sm text-foreground outline-none ' +
  'placeholder:text-muted-foreground ' +
  'focus:border-ring focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_18%,transparent)]'

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export const AuthField = forwardRef<HTMLInputElement, FieldProps>(function AuthField(
  { label, error, id, className, ...props },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-[11.5px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(FIELD_CLASS, error ? 'border-destructive' : 'border-border', className)}
        {...props}
      />
      {error && (
        <p id={`${fieldId}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
})

interface PasswordFieldProps extends FieldProps {
  /** Slot for the "Forgot?" link, rendered on the label row. */
  action?: React.ReactNode
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, action, id, children, ...props }, ref) {
    const generatedId = useId()
    const fieldId = id ?? generatedId
    const [visible, setVisible] = useState(false)

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={fieldId} className="text-[11.5px] font-medium text-muted-foreground">
            {label}
          </label>
          {action}
        </div>

        <div
          className={cn(
            'flex h-[46px] items-center gap-2 rounded-[11px] border bg-background px-3.5',
            'focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_18%,transparent)]',
            error ? 'border-destructive' : 'border-border',
          )}
        >
          <input
            ref={ref}
            id={fieldId}
            type={visible ? 'text' : 'password'}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p id={`${fieldId}-error`} className="text-xs text-destructive">
            {error}
          </p>
        )}
        {children}
      </div>
    )
  },
)

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const
const STRENGTH_COLOURS = [
  'bg-expense',
  'bg-warning-fill',
  'bg-warning-fill',
  'bg-income',
] as const

/** 0–4, from length and character variety. Indicative only — the server is the authority. */
export function passwordStrength(password: string): number {
  if (password.length < 8) return password.length === 0 ? 0 : 1
  let score = 1
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score++
  return Math.min(score, 4)
}

export function PasswordStrength({ password }: { password: string }) {
  const score = passwordStrength(password)

  return (
    <div className="flex flex-col gap-1.5 pt-0.5">
      <div aria-hidden className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              i < score ? STRENGTH_COLOURS[score - 1] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {password.length === 0 ? 'At least 8 characters' : STRENGTH_LABELS[score]}
      </p>
    </div>
  )
}
