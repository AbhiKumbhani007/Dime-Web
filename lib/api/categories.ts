import { api } from '@/lib/api'

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  isDefault: boolean
  userId: string
  createdAt: string
}

export function getCategories(): Promise<{ categories: Category[] }> {
  return api.get('api/categories').json<{ categories: Category[] }>()
}

export function createCategory(data: {
  name: string
  emoji: string
  color: string
}): Promise<{ category: Category }> {
  return api.post('api/categories', { json: data }).json<{ category: Category }>()
}

export function updateCategory(
  id: string,
  data: { name?: string; emoji?: string; color?: string }
): Promise<{ category: Category }> {
  return api.patch(`api/categories/${id}`, { json: data }).json<{ category: Category }>()
}

export function deleteCategory(id: string): Promise<void> {
  return api.delete(`api/categories/${id}`).json<void>()
}
