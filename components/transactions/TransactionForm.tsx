'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarIcon, Loader2 } from 'lucide-react'

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
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCategories } from '@/hooks/useCategories'
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions'
import { formatDateLong } from '@/lib/utils/date'
import { parseAmount } from '@/lib/utils/currency'
import type { Transaction } from '@/lib/api/transactions'
import type { Category } from '@/lib/api/categories'

const transactionSchema = z.object({
  amount: z
    .number({ error: 'Amount is required' })
    .positive('Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  note: z.string().max(500, 'Note must be 500 characters or less').optional(),
  isIncome: z.boolean(),
  categoryId: z.string().min(1, 'Category is required'),
})

type TransactionFormValues = z.infer<typeof transactionSchema>

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction
  defaultValues?: Partial<TransactionFormValues>
  onSuccess?: () => void
}

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  defaultValues,
  onSuccess,
}: TransactionFormProps) {
  const isEdit = !!transaction
  const [apiError, setApiError] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()

  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: transaction?.amount ?? defaultValues?.amount ?? 0,
      date:
        transaction?.date ??
        defaultValues?.date ??
        new Date().toISOString(),
      note: transaction?.note ?? defaultValues?.note ?? '',
      isIncome: transaction?.isIncome ?? defaultValues?.isIncome ?? false,
      categoryId: transaction?.categoryId ?? defaultValues?.categoryId ?? '',
    },
  })

  const selectedCategoryId = watch('categoryId')
  const selectedIsIncome = watch('isIncome')
  const selectedDate = watch('date')
  const selectedCategory: Category | undefined = categories.find(
    (c) => c.id === selectedCategoryId
  )

  useEffect(() => {
    if (open) {
      const initialAmount =
        transaction?.amount ?? defaultValues?.amount ?? 0
      reset({
        amount: initialAmount,
        date:
          transaction?.date ??
          defaultValues?.date ??
          new Date().toISOString(),
        note: transaction?.note ?? defaultValues?.note ?? '',
        isIncome: transaction?.isIncome ?? defaultValues?.isIncome ?? false,
        categoryId:
          transaction?.categoryId ??
          defaultValues?.categoryId ??
          categories[0]?.id ??
          '',
      })
      setAmountText(initialAmount > 0 ? String(initialAmount) : '')
      setApiError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction])

  async function onSubmit(values: TransactionFormValues) {
    setApiError(null)
    try {
      if (isEdit && transaction) {
        await updateTransaction.mutateAsync({
          id: transaction.id,
          patch: {
            amount: values.amount,
            date: values.date,
            note: values.note || undefined,
            isIncome: values.isIncome,
            categoryId: values.categoryId,
          },
        })
      } else {
        await createTransaction.mutateAsync({
          amount: values.amount,
          date: values.date,
          note: values.note || undefined,
          isIncome: values.isIncome,
          categoryId: values.categoryId,
        })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 404) {
        setApiError('Category no longer exists. Pick another.')
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    }
  }

  const isLoading =
    isSubmitting || createTransaction.isPending || updateTransaction.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="mb-4">
          <SheetTitle>
            {isEdit ? 'Edit Transaction' : 'New Transaction'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Income / Expense toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--muted)] rounded-lg">
            <button
              type="button"
              onClick={() => setValue('isIncome', false)}
              className={`py-2 text-sm font-medium rounded-md transition-colors ${
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
              className={`py-2 text-sm font-medium rounded-md transition-colors ${
                selectedIsIncome
                  ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)]'
              }`}
            >
              Income
            </button>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Amount
            </label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => {
                const raw = e.target.value
                setAmountText(raw)
                setValue('amount', parseAmount(raw), { shouldValidate: true })
              }}
              className="bg-[var(--input)] text-lg"
            />
            {errors.amount && (
              <p className="text-xs text-[var(--destructive)]">
                {errors.amount.message}
              </p>
            )}
          </div>

          {/* Category picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Category
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="justify-start"
            >
              {selectedCategory ? (
                <span className="flex items-center gap-2">
                  <span>{selectedCategory.emoji}</span>
                  <span>{selectedCategory.name}</span>
                </span>
              ) : (
                <span className="text-[var(--muted-foreground)]">Pick a category</span>
              )}
            </Button>
            {errors.categoryId && (
              <p className="text-xs text-[var(--destructive)]">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          {/* Date picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Date
            </label>
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value
                        ? formatDateLong(field.value)
                        : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          field.onChange(date.toISOString())
                          setDatePickerOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {errors.date && (
              <p className="text-xs text-[var(--destructive)]">
                {errors.date.message}
              </p>
            )}
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Note
            </label>
            <Textarea
              {...register('note')}
              placeholder="Optional note"
              className="bg-[var(--input)] min-h-[72px]"
            />
            {errors.note && (
              <p className="text-xs text-[var(--destructive)]">
                {errors.note.message}
              </p>
            )}
          </div>

          {apiError && (
            <p className="text-sm text-[var(--destructive)]">{apiError}</p>
          )}

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

        {/* Mini category picker sheet */}
        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[60vh] overflow-y-auto rounded-t-2xl"
          >
            <SheetHeader className="mb-3">
              <SheetTitle>Select category</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setValue('categoryId', cat.id, { shouldValidate: true })
                    setPickerOpen(false)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                    selectedCategoryId === cat.id
                      ? 'border-[var(--foreground)] bg-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </SheetContent>
    </Sheet>
  )
}
