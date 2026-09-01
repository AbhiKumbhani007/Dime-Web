'use client'

import { useCallback, useMemo, useState } from 'react'
import { SearchBar } from '@/components/transactions/SearchBar'
import { FilterBar } from '@/components/transactions/FilterBar'
import { LogKpis } from '@/components/transactions/LogKpis'
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
    <div className="flex min-h-full min-w-0 flex-col gap-(--gap) p-(--pad-page)">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <SearchBar />
        <FilterBar />
      </div>

      <LogKpis />

      <TransactionList onEdit={handleEdit} />

      <TransactionForm open={formOpen} onOpenChange={setFormOpen} transaction={editing} />
    </div>
  )
}
