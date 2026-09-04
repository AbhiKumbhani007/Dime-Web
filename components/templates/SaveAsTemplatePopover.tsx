'use client'

import { useState } from 'react'
import { BookmarkPlus, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateTemplate } from '@/hooks/useTemplates'
import { toastError, toastSuccess } from '@/lib/toast'
import type { CreateTemplateInput } from '@/lib/api/templates'

interface SaveAsTemplateValues {
  amount: number
  categoryId?: string
  note?: string
  isIncome: boolean
}

interface SaveAsTemplatePopoverProps {
  /** The live current TransactionForm field values, read at submit time. */
  values: SaveAsTemplateValues
  disabled?: boolean
}

/**
 * Small trigger + popover, embedded in TransactionForm's SheetFooter, that
 * turns the form's current field values into a new template without leaving
 * the transaction sheet.
 */
export function SaveAsTemplatePopover({ values, disabled }: SaveAsTemplatePopoverProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createTemplate = useCreateTemplate()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setLabel('')
      setError(null)
    }
  }

  async function handleSave() {
    if (!label.trim()) {
      setError('Label is required')
      return
    }
    setError(null)
    try {
      const input: CreateTemplateInput = {
        label: label.trim(),
        amount: values.amount > 0 ? values.amount : null,
        note: values.note || undefined,
        isIncome: values.isIncome,
        categoryId: values.categoryId || undefined,
      }
      await createTemplate.mutateAsync(input)
      toastSuccess('Template saved')
      handleOpenChange(false)
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 409) {
        setError('A template with this label already exists')
      } else {
        setError('Could not save template')
        toastError('Could not save template')
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="gap-1.5 text-[var(--muted-foreground)]"
        >
          <BookmarkPlus className="h-4 w-4" />
          Save as template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="save-as-template-label"
            className="text-sm font-medium text-[var(--foreground)]"
          >
            Template name
          </label>
          <Input
            id="save-as-template-label"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Morning coffee"
            className="bg-[var(--input)]"
          />
          {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={createTemplate.isPending}
            className="mt-1"
          >
            {createTemplate.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
