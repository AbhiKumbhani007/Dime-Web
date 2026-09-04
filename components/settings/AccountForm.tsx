'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HTTPError } from 'ky'

import { AuthField, PasswordField, PasswordStrength } from '@/components/auth/AuthFields'
import { Button } from '@/components/ui/button'
import { updateMe, updatePassword } from '@/lib/api/auth'
import { useAuthStore } from '@/store/useAuthStore'
import { toastError, toastSuccess } from '@/lib/toast'

/**
 * Inline name edit. Mirrors ThemeSelector's local isEditing/saving state +
 * `useAuthStore.getState().updateUser()` sync pattern, adapted for a
 * confirm/cancel text field instead of a one-click swatch.
 */
function NameSection() {
  const user = useAuthStore((s) => s.user)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(user?.name ?? '')

  function startEdit() {
    setName(user?.name ?? '')
    setIsEditing(true)
  }

  function cancelEdit() {
    setName(user?.name ?? '')
    setIsEditing(false)
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await updateMe({ name })
      useAuthStore.getState().updateUser({ name: updated.name })
      setIsEditing(false)
      toastSuccess('Name updated')
    } catch {
      toastError('Could not update name. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-(--pad-card)">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</h3>

      {isEditing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <AuthField
              id="name"
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-foreground">{user?.name || 'No name set'}</span>
          <Button type="button" size="sm" variant="outline" onClick={startEdit}>
            Edit
          </Button>
        </div>
      )}
    </section>
  )
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmNewPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  })

type PasswordFormValues = z.infer<typeof passwordSchema>

/** The flat-string 400 body dime-api's auth routes send, e.g. `{ error: "Current password is incorrect" }`. */
interface FlatApiError {
  error?: string
}

function PasswordSection() {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  })

  const newPassword = useWatch({ control, name: 'newPassword' }) ?? ''

  async function onSubmit(values: PasswordFormValues) {
    try {
      await updatePassword({ oldPassword: values.currentPassword, newPassword: values.newPassword })
      reset()
      toastSuccess('Password updated')
    } catch (err: unknown) {
      // dime-api returns 400 with a flat `{ error: string }` body for a wrong
      // current password (not the structured `{ error: { code, message } }`
      // shape other endpoints use) — surface it under the field, no toast,
      // no redirect.
      if (err instanceof HTTPError && err.response.status === 400) {
        const body: FlatApiError | null = await err.response.json().catch(() => null)
        setError('currentPassword', {
          type: 'manual',
          message: body?.error ?? 'Current password is incorrect',
        })
        return
      }
      toastError('Could not update password. Please try again.')
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-(--pad-card)">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Change password
      </h3>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <PasswordField
          id="currentPassword"
          label="Current password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />

        <PasswordField
          id="newPassword"
          label="New password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        >
          <PasswordStrength password={newPassword} />
        </PasswordField>

        <PasswordField
          id="confirmNewPassword"
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirmNewPassword?.message}
          {...register('confirmNewPassword')}
        />

        <Button type="submit" size="sm" className="w-fit" disabled={isSubmitting}>
          {isSubmitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </section>
  )
}

export function AccountForm() {
  return (
    <>
      <NameSection />
      <PasswordSection />
    </>
  )
}
