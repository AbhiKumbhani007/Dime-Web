import { api } from '@/lib/api'

export type TemplateSort = 'usage' | 'recent' | 'label'

export interface TemplateCategory {
  id: string
  name: string
  emoji: string
  color: string
}

export interface Template {
  id: string
  label: string
  emoji: string
  amount: number | null
  note: string | null
  isIncome: boolean
  usageCount: number
  lastUsedAt: string | null
  categoryId: string | null
  createdAt: string
  updatedAt: string
  category: TemplateCategory | null
}

export interface CreateTemplateInput {
  label: string
  emoji?: string
  amount?: number | null
  note?: string
  isIncome?: boolean
  categoryId?: string
}

export interface UpdateTemplateInput {
  label?: string
  emoji?: string
  amount?: number | null
  note?: string | null
  isIncome?: boolean
  categoryId?: string | null
}

export function getTemplates(sort?: TemplateSort): Promise<{ templates: Template[] }> {
  return api
    .get('api/templates', sort ? { searchParams: { sort } } : undefined)
    .json<{ templates: Template[] }>()
}

export function createTemplate(data: CreateTemplateInput): Promise<{ template: Template }> {
  return api.post('api/templates', { json: data }).json<{ template: Template }>()
}

export function updateTemplate(
  id: string,
  data: UpdateTemplateInput
): Promise<{ template: Template }> {
  return api.patch(`api/templates/${id}`, { json: data }).json<{ template: Template }>()
}

export function deleteTemplate(id: string): Promise<void> {
  return api.delete(`api/templates/${id}`).json<void>()
}
