'use client'

import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCategories } from '@/hooks/useCategories'
import { useCreateTemplate, useUpdateTemplate } from '@/hooks/useTemplates'
import { parseAmount } from '@/lib/utils/currency'
import type { Template } from '@/lib/api/templates'

// Same 8-wide grid pattern as CategoryForm/BudgetForm's EMOJI_GRID; templates
// have no colour of their own (they borrow one from their category when
// rendered as a chip), so there is no colour-swatch section here.
const EMOJI_GRID = [
  '🧾','🍔','🍕','☕','🛍️','🚌','⚡','📱',
  '🏠','💊','✈️','🎬','🎮','🎁','💳','💰',
  '📈','🐾','🌿','🎯','🔧','📦','✨','🏋️',
]

// Mirrors the server's constraints (templates.schema.ts) so bad input is
// caught before the round trip.
const templateSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(50, 'Label must be 50 characters or less'),
  emoji: z.string().trim().min(1, 'Emoji is required').max(10, 'Emoji must be 10 characters or less'),
  amount: z.number().nullable(),
  note: z.string().max(500, 'Note must be 500 characters or less').optional(),
  isIncome: z.boolean(),
  categoryId: z.string().optional(),
})

type TemplateFormValues = z.infer<typeof templateSchema>

interface TemplateFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: Template
  onSuccess?: () => void
}

export function TemplateForm({ open, onOpenChange, template, onSuccess }: TemplateFormProps) {
  const isEdit = !!template
  const [apiError, setApiError] = useState<string | null>(null)
  const [amountText, setAmountText] = useState(
    template?.amount != null ? String(template.amount) : '',
  )
  const fieldId = useId()

  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []

  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  function defaults(): TemplateFormValues {
    return {
      label: template?.label ?? '',
      emoji: template?.emoji ?? EMOJI_GRID[0],
      amount: template?.amount ?? null,
      note: template?.note ?? '',
      isIncome: template?.isIncome ?? false,
      categoryId: template?.categoryId ?? '',
    }
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: defaults(),
  })

  const selectedEmoji = watch('emoji')
  const selectedIsIncome = watch('isIncome')
  const selectedCategoryId = watch('categoryId')

  useEffect(() => {
    if (open) {
      reset(defaults())
      setAmountText(template?.amount != null ? String(template.amount) : '')
      setApiError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, reset])

  async function onSubmit(values: TemplateFormValues) {
    setApiError(null)
    try {
      if (isEdit && template) {
        await updateTemplate.mutateAsync({
          id: template.id,
          data: {
            label: values.label,
            emoji: values.emoji,
            amount: values.amount,
            // Unlike create, PATCH's note is nullable — an emptied note must
            // be sent as `null` to actually clear it, not omitted (omission
            // means "unchanged" server-side).
            note: values.note ? values.note : null,
            isIncome: values.isIncome,
            categoryId: values.categoryId ? values.categoryId : null,
          },
        })
      } else {
        await createTemplate.mutateAsync({
          label: values.label,
          emoji: values.emoji,
          amount: values.amount,
          note: values.note || undefined,
          isIncome: values.isIncome,
          categoryId: values.categoryId || undefined,
        })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 409) {
        setApiError('A template with this label already exists')
      } else if (anyErr?.response?.status === 404) {
        setApiError('Category no longer exists. Pick another.')
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    }
  }

  const isLoading = isSubmitting || createTemplate.isPending || updateTemplate.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="scrollbar-thin w-full overflow-y-auto sm:max-w-[440px] sm:rounded-l-2xl"
      >
        <SheetHeader className="mb-4">
          <SheetTitle>{isEdit ? 'Edit Template' : 'New Template'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Label */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-label`} className="text-sm font-medium text-[var(--foreground)]">
              Label
            </label>
            <Input
              id={`${fieldId}-label`}
              {...register('label')}
              placeholder="e.g. Morning coffee"
              className="bg-[var(--input)]"
            />
            {errors.label && (
              <p className="text-xs text-[var(--destructive)]">{errors.label.message}</p>
            )}
          </div>

          {/* Emoji picker */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Choose emoji</span>
            <div role="radiogroup" aria-label="Emoji" className="grid grid-cols-8 gap-1.5">
              {EMOJI_GRID.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={selectedEmoji === emoji}
                  aria-label={emoji}
                  onClick={() => setValue('emoji', emoji)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-all ${
                    selectedEmoji === emoji
                      ? 'border-2 border-[var(--foreground)] bg-[var(--accent)]'
                      : 'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {errors.emoji && (
              <p className="text-xs text-[var(--destructive)]">{errors.emoji.message}</p>
            )}
          </div>

          {/* Income / Expense toggle */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Type</span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--muted)] p-1">
              <button
                type="button"
                onClick={() => setValue('isIncome', false)}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  !selectedIsIncome
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)]'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setValue('isIncome', true)}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  selectedIsIncome
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)]'
                }`}
              >
                Income
              </button>
            </div>
          </div>

          {/* Amount (optional) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-amount`} className="text-sm font-medium text-[var(--foreground)]">
              Amount <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
            </label>
            <Input
              id={`${fieldId}-amount`}
              inputMode="decimal"
              placeholder="0.00"
              className="bg-[var(--input)]"
              value={amountText}
              onChange={(e) => {
                const raw = e.target.value
                setAmountText(raw)
                setValue('amount', raw.trim() === '' ? null : parseAmount(raw), {
                  shouldValidate: true,
                })
              }}
            />
            {errors.amount && (
              <p className="text-xs text-[var(--destructive)]">{errors.amount.message}</p>
            )}
          </div>

          {/* Category (optional) */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Category</span>
            <div
              role="radiogroup"
              aria-label="Category"
              className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!selectedCategoryId}
                onClick={() => setValue('categoryId', '')}
                className={`rounded-full px-3 py-1.5 text-xs transition-all ${
                  !selectedCategoryId
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                }`}
              >
                None
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedCategoryId === category.id}
                  onClick={() => setValue('categoryId', category.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition-all ${
                    selectedCategoryId === category.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {category.emoji} {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-note`} className="text-sm font-medium text-[var(--foreground)]">
              Note
            </label>
            <Textarea
              id={`${fieldId}-note`}
              {...register('note')}
              placeholder="Optional note"
              className="bg-[var(--input)] min-h-[72px]"
            />
            {errors.note && (
              <p className="text-xs text-[var(--destructive)]">{errors.note.message}</p>
            )}
          </div>

          {apiError && <p className="text-sm text-[var(--destructive)]">{apiError}</p>}

          <SheetFooter className="flex flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
