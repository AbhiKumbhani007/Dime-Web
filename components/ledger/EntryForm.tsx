'use client'

import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateLedgerEntry, useUpdateLedgerEntry } from '@/hooks/useLedger'
import { formatINR, parseAmount } from '@/lib/utils/currency'
import { toISODateString } from '@/lib/utils/date'
import { ENTRY_TYPE_META } from '@/lib/utils/ledger'
import type { LedgerEntry, LedgerEntryType } from '@/lib/api/ledger'

// Mirrors the server's CreateEntryBodySchema/UpdateEntryBodySchema constraints.
const entrySchema = z.object({
  amount: z
    .number({ message: 'Amount is required' })
    .positive('Amount must be greater than 0')
    .max(1_000_000_000, 'Amount is too large')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places'),
  type: z.enum(['GAVE', 'RECEIVED']),
  date: z.string().min(1, 'Date is required'),
  note: z.string().trim().max(500, 'Note must be 500 characters or less'),
})

type EntryFormValues = z.infer<typeof entrySchema>

interface EntryFormProps {
  open: boolean
  personId: string
  firstName: string
  /** Present pre-fills and switches the form to edit mode — this is what
   * makes the mockup's drawn-but-dead pencil icon actually work. */
  entry?: LedgerEntry
  onClose: () => void
  onSuccess?: () => void
}

export function EntryForm({ open, personId, firstName, entry, onClose, onSuccess }: EntryFormProps) {
  const isEdit = !!entry
  const [apiError, setApiError] = useState<string | null>(null)
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '')
  const fieldId = useId()

  const createEntry = useCreateLedgerEntry(personId)
  const updateEntry = useUpdateLedgerEntry(personId)

  function defaults(): EntryFormValues {
    return {
      amount: entry?.amount ?? ('' as unknown as number),
      type: entry?.type ?? 'GAVE',
      date: entry ? entry.date.slice(0, 10) : toISODateString(new Date()),
      note: entry?.note ?? '',
    }
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: defaults(),
  })

  const selectedType = watch('type')
  const watchedAmount = watch('amount')

  useEffect(() => {
    if (open) {
      reset(defaults())
      setAmountText(entry ? String(entry.amount) : '')
      setApiError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry, reset])

  async function onSubmit(values: EntryFormValues) {
    setApiError(null)
    try {
      if (isEdit && entry) {
        await updateEntry.mutateAsync({ id: entry.id, data: values })
      } else {
        await createEntry.mutateAsync(values)
      }
      onSuccess?.()
      onClose()
    } catch {
      setApiError('Something went wrong. Please try again.')
    }
  }

  if (!open) return null

  const isLoading = isSubmitting || createEntry.isPending || updateEntry.isPending
  const typeMeta = ENTRY_TYPE_META[selectedType as LedgerEntryType]
  const previewAmount = Number.isFinite(watchedAmount) && watchedAmount > 0 ? formatINR(watchedAmount) : '₹0'
  const previewVerb = selectedType === 'GAVE' ? 'up' : 'down'

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-accent bg-card p-(--pad-card)">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[13.5px] font-semibold">
          {isEdit ? `Edit entry with ${firstName}` : `New entry with ${firstName}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Direction">
          <button
            type="button"
            role="radio"
            aria-checked={selectedType === 'GAVE'}
            onClick={() => setValue('type', 'GAVE')}
            className={`flex flex-col items-start gap-1.5 rounded-[13px] border-[1.5px] p-3 text-left transition-colors ${
              selectedType === 'GAVE' ? 'border-income bg-income/10' : 'border-border bg-transparent hover:bg-muted'
            }`}
          >
            <ENTRY_TYPE_META.GAVE.icon
              className="h-[18px] w-[18px] rounded-md p-0.5"
              style={{ color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 16%, transparent)' }}
            />
            <span className="text-[13px] font-semibold">I gave</span>
            <span className="text-[10.5px] text-muted-foreground">they owe me more</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={selectedType === 'RECEIVED'}
            onClick={() => setValue('type', 'RECEIVED')}
            className={`flex flex-col items-start gap-1.5 rounded-[13px] border-[1.5px] p-3 text-left transition-colors ${
              selectedType === 'RECEIVED'
                ? 'border-expense bg-expense/10'
                : 'border-border bg-transparent hover:bg-muted'
            }`}
          >
            <ENTRY_TYPE_META.RECEIVED.icon
              className="h-[18px] w-[18px] rounded-md p-0.5"
              style={{ color: 'var(--expense)', background: 'color-mix(in srgb, var(--expense) 16%, transparent)' }}
            />
            <span className="text-[13px] font-semibold">I received</span>
            <span className="text-[10.5px] text-muted-foreground">their debt goes down</span>
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-amount`} className="text-[11px] font-medium text-muted-foreground">
            Amount
          </label>
          <div className="flex h-[52px] items-center gap-2 rounded-xl border-[1.5px] border-ring bg-background px-3.5">
            <span className="font-mono text-lg text-muted-foreground">₹</span>
            <input
              id={`${fieldId}-amount`}
              inputMode="decimal"
              placeholder="0"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value)
                setValue('amount', parseAmount(e.target.value), { shouldValidate: true })
              }}
              className="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-semibold outline-none"
              style={{ color: typeMeta.tone }}
            />
          </div>
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-date`} className="text-[11px] font-medium text-muted-foreground">
              Date
            </label>
            <Input id={`${fieldId}-date`} type="date" {...register('date')} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-note`} className="text-[11px] font-medium text-muted-foreground">
              Note
            </label>
            <Input id={`${fieldId}-note`} {...register('note')} placeholder="Concert tickets" />
          </div>
        </div>

        {apiError && <p className="text-sm text-destructive">{apiError}</p>}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Save entry'
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Balance goes {previewVerb} by {previewAmount}
          </span>
        </div>
      </form>
    </div>
  )
}
