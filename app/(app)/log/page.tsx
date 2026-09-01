'use client'

import { useCallback, useMemo, useState } from 'react'
import { SearchBar } from '@/components/transactions/SearchBar'
import { FilterBar } from '@/components/transactions/FilterBar'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { usePageChrome } from '@/components/layout/PageChrome'
import type { Transaction } from '@/lib/api/transactions'

export default function LogPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | undefined>(undefined)

  const handleAdd = useCallback(() => {
    setEditing(undefined)
    setFormOpen(true)
  }, [])

  function handleEdit(tx: Transaction) {
    setEditing(tx)
    setFormOpen(true)
  }

  // One declaration drives the top-bar button (md+), the FAB (mobile) and `n`.
  usePageChrome(
    useMemo(
      () => ({ primaryAction: { label: 'Add transaction', onClick: handleAdd } }),
      [handleAdd],
    ),
  )

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-20 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <SearchBar />
        <FilterBar />
      </div>

      <TransactionList onEdit={handleEdit} />

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
      />
    </div>
  )
}
