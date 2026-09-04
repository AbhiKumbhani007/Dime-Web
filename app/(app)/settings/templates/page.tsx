'use client'

import { useCallback, useMemo, useState } from 'react'
import { LayoutTemplate, Pencil, Trash2 } from 'lucide-react'

import { usePageChrome } from '@/components/layout/PageChrome'
import { Skeleton } from '@/components/ui/skeleton'
import { EmojiTile } from '@/components/ui/emoji-tile'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TemplateForm } from '@/components/templates/TemplateForm'
import { DeleteTemplateDialog } from '@/components/templates/DeleteTemplateDialog'
import { useTemplates } from '@/hooks/useTemplates'
import { formatINR } from '@/lib/utils/currency'
import type { Template, TemplateSort } from '@/lib/api/templates'

const SORT_OPTIONS: { value: TemplateSort; label: string }[] = [
  { value: 'usage', label: 'Most used' },
  { value: 'recent', label: 'Recent' },
  { value: 'label', label: 'A–Z' },
]

const DEFAULT_COLOUR = '#6b7280'

export default function TemplatesPage() {
  const [sort, setSort] = useState<TemplateSort>('usage')
  const { data, isLoading } = useTemplates(sort)

  const [formOpen, setFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>(undefined)
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null)

  const handleAdd = useCallback(() => {
    setEditingTemplate(undefined)
    setFormOpen(true)
  }, [])

  usePageChrome(
    useMemo(
      () => ({ title: 'Templates', primaryAction: { label: 'Add template', onClick: handleAdd } }),
      [handleAdd],
    ),
  )

  function handleEdit(template: Template) {
    setEditingTemplate(template)
    setFormOpen(true)
  }

  function handleDelete(template: Template) {
    setDeletingTemplate(template)
  }

  const templates = data?.templates ?? []

  return (
    <div className="flex flex-col gap-(--gap) p-(--pad-page)">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted-foreground)]">
          Quick-fill chips for the transaction sheet.
        </p>
        <SegmentedControl
          label="Sort templates"
          options={SORT_OPTIONS}
          value={sort}
          onChange={setSort}
          size="sm"
        />
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl bg-[var(--muted)]" />
          ))}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
          <LayoutTemplate className="h-12 w-12 text-[var(--muted-foreground)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold">No templates yet</h2>
          <p className="max-w-xs text-sm text-[var(--muted-foreground)]">
            Save a transaction as a template to add it back with one tap next time.
          </p>
        </div>
      )}

      {!isLoading && templates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          {/* Header row — hidden on mobile, where each row folds its own labels in. */}
          <div className="hidden items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)] px-(--pad-card) py-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] md:flex">
            <span className="min-w-0 flex-1">Template</span>
            <span className="w-[140px] shrink-0">Category</span>
            <span className="w-[110px] shrink-0 text-right">Amount</span>
            <span className="w-[70px] shrink-0 text-right">Used</span>
            <span className="w-[68px] shrink-0" aria-hidden />
          </div>

          {templates.map((template) => {
            const colour = template.category?.color ?? DEFAULT_COLOUR
            return (
              <div
                key={template.id}
                data-testid={`template-row-${template.id}`}
                className="group flex min-h-(--row-h) items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-(--pad-card) py-2.5 last:border-b-0 hover:bg-[var(--muted)]"
              >
                <EmojiTile emoji={template.emoji} colour={colour} shape="square" size="md" />

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-medium text-[var(--foreground)]">
                    {template.label}
                  </span>
                  <span className="truncate text-[11px] text-[var(--muted-foreground)] md:hidden">
                    {template.category?.name ?? 'No category'}
                    {template.amount !== null ? ` · ${formatINR(template.amount)}` : ''}
                  </span>
                </span>

                <span className="hidden w-[140px] shrink-0 truncate text-xs text-[var(--muted-foreground)] md:block">
                  {template.category?.name ?? '—'}
                </span>

                <span className="hidden w-[110px] shrink-0 text-right font-mono text-sm text-[var(--foreground)] md:block">
                  {template.amount !== null ? formatINR(template.amount) : '—'}
                </span>

                <span className="hidden w-[70px] shrink-0 text-right font-mono text-xs text-[var(--muted-foreground)] md:block">
                  {template.usageCount}
                </span>

                <span className="flex w-[68px] shrink-0 justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={`Edit ${template.label}`}
                    onClick={() => handleEdit(template)}
                    className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-opacity hover:bg-[var(--background)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${template.label}`}
                    onClick={() => handleDelete(template)}
                    className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-opacity hover:bg-[var(--destructive)] hover:text-white focus-visible:outline-2 focus-visible:outline-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <TemplateForm open={formOpen} onOpenChange={setFormOpen} template={editingTemplate} />

      <DeleteTemplateDialog
        open={deletingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTemplate(null)
        }}
        template={deletingTemplate}
      />
    </div>
  )
}
