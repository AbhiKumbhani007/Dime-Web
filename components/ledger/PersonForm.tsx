'use client'

import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateLedgerPerson, useUpdateLedgerPerson } from '@/hooks/useLedger'
import type { LedgerPerson } from '@/lib/api/ledger'

const COLOR_SWATCHES = [
  '#f97316',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#14b8a6',
  '#0ea5e9',
  '#f43f5e',
]

// Mirrors the server's NameSchema/PhoneSchema/NoteSchema/ColorSchema
// constraints so bad input is caught before the round trip.
const personSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[+0-9][0-9 ()-]{5,19}$/.test(v), 'Enter a valid phone number'),
  note: z.string().trim().max(500, 'Note must be 500 characters or less'),
  color: z.string().min(1, 'Colour is required'),
})

type PersonFormValues = z.infer<typeof personSchema>

interface PersonFormProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** Present pre-fills and switches the form to edit mode, submitting an
   * update instead of a create. */
  person?: LedgerPerson
}

/**
 * Inline card, not a `Sheet`. A right-edge slide-in would compete with the
 * detail pane for the same screen real estate on desktop, and stack a second
 * full-screen surface on top of mobile's already-full-screen detail view.
 */
export function PersonForm({ open, onClose, onSuccess, person }: PersonFormProps) {
  const isEdit = !!person
  const [apiError, setApiError] = useState<string | null>(null)
  const fieldId = useId()
  const createPerson = useCreateLedgerPerson()
  const updatePerson = useUpdateLedgerPerson()

  function defaults(): PersonFormValues {
    return {
      name: person?.name ?? '',
      phone: person?.phone ?? '',
      note: person?.note ?? '',
      color: person?.color ?? COLOR_SWATCHES[6],
    }
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    defaultValues: defaults(),
  })

  const selectedColor = watch('color')

  useEffect(() => {
    if (open) {
      reset(defaults())
      setApiError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person, reset])

  async function onSubmit(values: PersonFormValues) {
    setApiError(null)
    try {
      if (isEdit && person) {
        // Fields are always rendered with their current value, so a blank
        // field here means the user cleared it — send `null` to actually
        // clear it server-side rather than omitting (which means no change).
        await updatePerson.mutateAsync({
          id: person.id,
          data: {
            name: values.name,
            phone: values.phone || null,
            note: values.note || null,
            color: values.color,
          },
        })
      } else {
        await createPerson.mutateAsync({
          name: values.name,
          phone: values.phone || undefined,
          note: values.note || undefined,
          color: values.color,
        })
      }
      onSuccess?.()
      onClose()
    } catch {
      setApiError('Something went wrong. Please try again.')
    }
  }

  if (!open) return null

  const isLoading = isSubmitting || createPerson.isPending || updatePerson.isPending

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-accent bg-card p-(--pad-card)">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[13px] font-semibold">{isEdit ? 'Edit person' : 'New person'}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-name`} className="text-[11px] font-medium text-muted-foreground">
            Name
          </label>
          <Input id={`${fieldId}-name`} {...register('name')} placeholder="e.g. Aarav Mehta" autoFocus />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-phone`} className="text-[11px] font-medium text-muted-foreground">
              Phone <span className="opacity-70">optional</span>
            </label>
            <Input id={`${fieldId}-phone`} {...register('phone')} placeholder="+91" />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-note`} className="text-[11px] font-medium text-muted-foreground">
              Note <span className="opacity-70">optional</span>
            </label>
            <Input id={`${fieldId}-note`} {...register('note')} placeholder="Flatmate" />
            {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Avatar colour</span>
          <div role="radiogroup" aria-label="Avatar colour" className="flex flex-wrap gap-1.5">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selectedColor === color}
                aria-label={color}
                onClick={() => setValue('color', color)}
                className={`h-[30px] w-[30px] rounded-full transition-all ${
                  selectedColor === color ? 'ring-2 ring-foreground ring-offset-2' : ''
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {apiError && <p className="text-sm text-destructive">{apiError}</p>}

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Add person'
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
