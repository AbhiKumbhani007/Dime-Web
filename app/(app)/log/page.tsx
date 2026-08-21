'use client'

import { useState } from 'react'
import { SearchBar } from '@/components/transactions/SearchBar'
import { FilterBar } from '@/components/transactions/FilterBar'
import { TransactionList } from '@/components/transactions/TransactionList'
import { AddTransactionFAB } from '@/components/transactions/AddTransactionFAB'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import type { Transaction } from '@/lib/api/transactions'

export default function LogPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | undefined>(undefined)

  function handleAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleEdit(tx: Transaction) {
    setEditing(tx)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-20 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <SearchBar />
        <FilterBar />
      </div>

      <TransactionList onEdit={handleEdit} />

      <AddTransactionFAB onClick={handleAdd} />

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
      />
    </div>
  )
}
