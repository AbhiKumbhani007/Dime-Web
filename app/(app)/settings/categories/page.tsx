'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryChip } from '@/components/categories/CategoryChip'
import { CategoryForm } from '@/components/categories/CategoryForm'
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog'
import { useCategories } from '@/hooks/useCategories'
import type { Category } from '@/lib/api/categories'

export default function CategoriesPage() {
  const { data, isLoading } = useCategories()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)

  function handleAdd() {
    setEditingCategory(undefined)
    setFormOpen(true)
  }

  function handleEdit(category: Category) {
    setEditingCategory(category)
    setFormOpen(true)
  }

  function handleDelete(category: Category) {
    setDeletingCategory(category)
  }

  const categories = data?.categories ?? []
  const defaultCategories = categories.filter((c) => c.isDefault)
  const customCategories = categories.filter((c) => !c.isDefault)

  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Categories</h2>
        <Button size="sm" onClick={handleAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-8 w-24 rounded-full animate-pulse bg-[var(--muted)]"
              />
            ))}
          </div>
        </div>
      )}

      {/* Defaults section */}
      {!isLoading && defaultCategories.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Defaults
          </h3>
          <div className="flex flex-wrap gap-2">
            {defaultCategories.map((cat) => (
              <CategoryChip key={cat.id} category={cat} />
            ))}
          </div>
        </section>
      )}

      {/* Custom section */}
      {!isLoading && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Custom
          </h3>
          {customCategories.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No custom categories yet. Tap + to add one.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customCategories.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  category={cat}
                  onEdit={() => handleEdit(cat)}
                  onDelete={() => handleDelete(cat)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Category form sheet */}
      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
      />

      {/* Delete confirmation dialog */}
      <DeleteCategoryDialog
        open={deletingCategory !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null)
        }}
        category={deletingCategory}
      />
    </div>
  )
}
