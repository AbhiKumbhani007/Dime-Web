'use client'

import { useState, useEffect } from 'react'
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
import { useCreateCategory, useUpdateCategory } from '@/hooks/useCategories'
import type { Category } from '@/lib/api/categories'

const EMOJI_GRID = [
  '🍔','🍕','🍜','☕','🛍️','🚌','✈️','🚗',
  '🏠','💊','⚡','📱','💼','💻','💰','📈',
  '🎬','🎮','🎁','🏋️','📚','🎓','🏥','💆',
  '✨','🌟','🔑','💳','🧾','🍺','🎵','📷',
  '🏡','🌿','🐾','🛒','🎂','🍦','🎪','⚽',
  '🎯','🎨','🔧','📦','🧹','🌐','💡','🔒',
]

const COLOR_SWATCHES = [
  '#ef4444','#f97316','#f59e0b','#22c55e','#10b981',
  '#3b82f6','#6366f1','#8b5cf6','#ec4899','#6b7280',
]

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  emoji: z.string().min(1, 'Emoji is required'),
  color: z.string().min(1, 'Color is required'),
})

type CategoryFormValues = z.infer<typeof categorySchema>

interface CategoryFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category
  onSuccess?: () => void
}

export function CategoryForm({ open, onOpenChange, category, onSuccess }: CategoryFormProps) {
  const isEdit = !!category
  const [apiError, setApiError] = useState<string | null>(null)

  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      emoji: category?.emoji ?? EMOJI_GRID[0],
      color: category?.color ?? COLOR_SWATCHES[0],
    },
  })

  const selectedEmoji = watch('emoji')
  const selectedColor = watch('color')

  // Reset form when category changes or sheet opens
  useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? '',
        emoji: category?.emoji ?? EMOJI_GRID[0],
        color: category?.color ?? COLOR_SWATCHES[0],
      })
      setApiError(null)
    }
  }, [open, category, reset])

  async function onSubmit(values: CategoryFormValues) {
    setApiError(null)
    try {
      if (isEdit && category) {
        await updateCategory.mutateAsync({ id: category.id, data: values })
      } else {
        await createCategory.mutateAsync(values)
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      // Check for 400 duplicate name error
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 400) {
        setApiError('A category with this name already exists')
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    }
  }

  const isLoading = isSubmitting || createCategory.isPending || updateCategory.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="mb-4">
          <SheetTitle>{isEdit ? 'Edit Category' : 'New Category'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Name field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Name
            </label>
            <Input
              {...register('name')}
              placeholder="Category name"
              className="bg-[var(--input)]"
            />
            {errors.name && (
              <p className="text-xs text-[var(--destructive)]">{errors.name.message}</p>
            )}
          </div>

          {/* Emoji section */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Choose emoji
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {EMOJI_GRID.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setValue('emoji', emoji)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all ${
                    selectedEmoji === emoji
                      ? 'border-2 border-[var(--foreground)] bg-[var(--accent)]'
                      : 'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--muted-foreground)]">
                Or enter a custom emoji
              </label>
              <Input
                value={selectedEmoji}
                onChange={(e) => setValue('emoji', e.target.value)}
                placeholder="Custom emoji"
                className="bg-[var(--input)] w-24"
                maxLength={4}
              />
            </div>
            {errors.emoji && (
              <p className="text-xs text-[var(--destructive)]">{errors.emoji.message}</p>
            )}
          </div>

          {/* Color section */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Choose color
            </label>
            <div className="flex flex-wrap gap-3">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue('color', color)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color
                      ? 'ring-2 ring-offset-2 ring-[var(--foreground)]'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={color}
                />
              ))}
            </div>
            {errors.color && (
              <p className="text-xs text-[var(--destructive)]">{errors.color.message}</p>
            )}
          </div>

          {/* API error */}
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
      </SheetContent>
    </Sheet>
  )
}
