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
import { useCategories } from '@/hooks/useCategories'
import { parseAmount } from '@/lib/utils/currency'
import { useCreateBudget, useUpdateBudget } from '@/hooks/useBudgets'
import { BUDGET_PERIODS, type BudgetPeriod, type BudgetWithProgress } from '@/lib/api/budgets'

const EMOJI_GRID = [
  '🛒','🍔','🚌','🏠','🛍️','🎬','💊','⚡',
  '📱','📚','✈️','💆','🎁','☕','🎮','🏋️',
  '💳','🧾','🐾','🌿','🎯','🔧','📦','✨',
]

const COLOUR_SWATCHES = [
  '#ef4444','#f97316','#f59e0b','#22c55e','#10b981',
  '#3b82f6','#6366f1','#8b5cf6','#ec4899','#6b7280',
]

// Mirrors the server's constraints so bad input is caught before the round trip.
const budgetSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  emoji: z.string().trim().min(1, 'Emoji is required'),
  colour: z.string().min(1, 'Colour is required'),
  type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  amount: z
    .number({ message: 'Amount is required' })
    .positive('Amount must be greater than 0')
    .max(1_000_000_000, 'Amount is too large')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places'),
  categoryId: z.string().min(1, 'Category is required'),
})

type BudgetFormValues = z.infer<typeof budgetSchema>

interface BudgetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget?: BudgetWithProgress
  onSuccess?: () => void
}

export function BudgetForm({ open, onOpenChange, budget, onSuccess }: BudgetFormProps) {
  const isEdit = !!budget
  const [apiError, setApiError] = useState<string | null>(null)
  const [amountText, setAmountText] = useState(budget ? String(budget.amount) : '')
  const fieldId = useId()

  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []

  const createBudget = useCreateBudget()
  const updateBudget = useUpdateBudget()

  function defaults(): BudgetFormValues {
    return {
      name: budget?.name ?? '',
      emoji: budget?.emoji ?? EMOJI_GRID[0],
      colour: budget?.colour ?? COLOUR_SWATCHES[6],
      type: (budget?.type ?? 'MONTHLY') as BudgetPeriod,
      amount: budget?.amount ?? ('' as unknown as number),
      categoryId: budget?.categoryId ?? '',
    }
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: defaults(),
  })

  const selectedEmoji = watch('emoji')
  const selectedColour = watch('colour')
  const selectedType = watch('type')
  const selectedCategoryId = watch('categoryId')

  useEffect(() => {
    if (open) {
      reset(defaults())
      setAmountText(budget ? String(budget.amount) : '')
      setApiError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget, reset])

  async function onSubmit(values: BudgetFormValues) {
    setApiError(null)
    try {
      if (isEdit && budget) {
        await updateBudget.mutateAsync({ id: budget.id, data: values })
      } else {
        await createBudget.mutateAsync(values)
      }
      onSuccess?.()
      onOpenChange(false)
    } catch {
      setApiError('Something went wrong. Please try again.')
    }
  }

  const isLoading = isSubmitting || createBudget.isPending || updateBudget.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>{isEdit ? 'Edit Budget' : 'New Budget'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-name`} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={`${fieldId}-name`}
              {...register('name')}
              placeholder="e.g. Groceries"
              className="bg-[var(--input)]"
            />
            {errors.name && (
              <p className="text-xs text-[var(--destructive)]">{errors.name.message}</p>
            )}
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-amount`} className="text-sm font-medium">
              Limit
            </label>
            <Input
              id={`${fieldId}-amount`}
              inputMode="decimal"
              placeholder="0.00"
              className="bg-[var(--input)]"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value)
                setValue('amount', parseAmount(e.target.value), { shouldValidate: true })
              }}
            />
            {errors.amount && (
              <p className="text-xs text-[var(--destructive)]">{errors.amount.message}</p>
            )}
          </div>

          {/* Period */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Period</span>
            <div role="radiogroup" aria-label="Period" className="grid grid-cols-4 gap-1.5">
              {BUDGET_PERIODS.map((period) => (
                <button
                  key={period.value}
                  type="button"
                  role="radio"
                  aria-checked={selectedType === period.value}
                  onClick={() => setValue('type', period.value)}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                    selectedType === period.value
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Category</span>
            <div
              role="radiogroup"
              aria-label="Category"
              className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto"
            >
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
            {errors.categoryId && (
              <p className="text-xs text-[var(--destructive)]">{errors.categoryId.message}</p>
            )}
          </div>

          {/* Emoji */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Icon</span>
            <div role="radiogroup" aria-label="Icon" className="grid grid-cols-8 gap-1.5">
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
          </div>

          {/* Colour */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Colour</span>
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-3">
              {COLOUR_SWATCHES.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  role="radio"
                  aria-checked={selectedColour === colour}
                  aria-label={colour}
                  onClick={() => setValue('colour', colour)}
                  className={`h-8 w-8 rounded-full transition-all ${
                    selectedColour === colour
                      ? 'ring-2 ring-[var(--foreground)] ring-offset-2'
                      : ''
                  }`}
                  style={{ backgroundColor: colour }}
                />
              ))}
            </div>
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
