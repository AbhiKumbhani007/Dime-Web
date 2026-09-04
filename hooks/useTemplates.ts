'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type Template,
  type TemplateSort,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from '@/lib/api/templates'

export const TEMPLATES_KEY = ['templates'] as const

export function templatesQueryKey(sort?: TemplateSort) {
  return [...TEMPLATES_KEY, sort ?? 'usage'] as const
}

export function useTemplates(sort?: TemplateSort) {
  return useQuery({
    queryKey: templatesQueryKey(sort),
    queryFn: () => getTemplates(sort),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTemplateInput) => createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateInput }) =>
      updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export type { Template }
