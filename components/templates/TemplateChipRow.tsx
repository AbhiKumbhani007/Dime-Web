'use client'

import { ChipRow } from '@/components/ui/chip-row'
import { TemplateChip } from '@/components/templates/TemplateChip'
import { useTemplates } from '@/hooks/useTemplates'
import type { Template } from '@/lib/api/templates'

interface TemplateChipRowProps {
  selectedId?: string | null
  onSelect: (template: Template) => void
}

/**
 * Horizontal row of template chips shown at the top of the transaction
 * form. Tapping a chip prefills the form; see TransactionForm.tsx.
 * Renders nothing until the user has at least one template.
 */
export function TemplateChipRow({ selectedId, onSelect }: TemplateChipRowProps) {
  const { data } = useTemplates()
  const templates = data?.templates ?? []

  if (templates.length === 0) return null

  return (
    <ChipRow label="Templates" role="group">
      {templates.map((template) => (
        <TemplateChip
          key={template.id}
          template={template}
          selected={selectedId === template.id}
          onClick={() => onSelect(template)}
        />
      ))}
    </ChipRow>
  )
}
