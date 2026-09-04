'use client'

import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useLedgerPeople, useLedgerEntries } from '@/hooks/useLedger'
import { useLedgerShortcuts } from '@/hooks/useLedgerShortcuts'
import { usePageChrome } from '@/components/layout/PageChrome'
import { KpiCard } from '@/components/ui/kpi-card'
import { PersonRow } from '@/components/ledger/PersonRow'
import { PersonRowSkeleton } from '@/components/ledger/PersonRowSkeleton'
import { PersonForm } from '@/components/ledger/PersonForm'
import { LedgerFilterBar, type LedgerFilter } from '@/components/ledger/LedgerFilterBar'
import { LedgerEmptyState, AllSquareState } from '@/components/ledger/EmptyStates'
import { PersonDetailHeader } from '@/components/ledger/PersonDetailHeader'
import { PersonDetailSkeleton } from '@/components/ledger/PersonDetailSkeleton'
import { EntryForm } from '@/components/ledger/EntryForm'
import { EntryRow } from '@/components/ledger/EntryRow'
import { SettleDialog } from '@/components/ledger/SettleDialog'
import { DeleteEntryDialog } from '@/components/ledger/DeleteEntryDialog'
import { DeletePersonDialog } from '@/components/ledger/DeletePersonDialog'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { LedgerEntry, LedgerPerson } from '@/lib/api/ledger'

function LedgerPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedPersonId = searchParams.get('person') ?? undefined

  const { data: peopleData, isLoading: peopleLoading, isError: peopleError } = useLedgerPeople()
  const { data: entriesData, isLoading: entriesLoading } = useLedgerEntries(selectedPersonId)

  const [filter, setFilter] = useState<LedgerFilter>('ALL')
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [personFormOpen, setPersonFormOpen] = useState(false)
  const [entryFormOpen, setEntryFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | undefined>(undefined)
  const [deletingEntry, setDeletingEntry] = useState<LedgerEntry | undefined>(undefined)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<LedgerPerson | undefined>(undefined)
  const [deletingPerson, setDeletingPerson] = useState<LedgerPerson | undefined>(undefined)
  const [deletePersonDialogOpen, setDeletePersonDialogOpen] = useState(false)

  const people = useMemo(() => peopleData?.people ?? [], [peopleData])
  const summary = peopleData?.summary
  const owedToYouCount = people.filter((p) => p.direction === 'OWED_TO_YOU').length
  const youOweCount = people.filter((p) => p.direction === 'YOU_OWE').length

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people.filter((p) => {
      if (filter !== 'ALL' && p.direction !== filter) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [people, filter, search])

  const selectedPerson = entriesData?.person ?? people.find((p) => p.id === selectedPersonId)

  const handleAddPerson = useCallback(() => setPersonFormOpen(true), [])

  usePageChrome(
    useMemo(
      () => ({
        primaryAction: { label: 'New person', onClick: handleAddPerson },
        onBack: selectedPersonId ? () => router.push('/ledger') : undefined,
        title: selectedPersonId && selectedPerson ? selectedPerson.name.split(' ')[0] : undefined,
      }),
      [handleAddPerson, selectedPersonId, selectedPerson, router],
    ),
  )

  function selectPerson(id: string) {
    router.push(`/ledger?person=${id}`)
  }

  function closeDetail() {
    router.push('/ledger')
  }

  function handleAddEntry() {
    setEditingEntry(undefined)
    setEntryFormOpen(true)
  }

  function handleEditEntry(entry: LedgerEntry) {
    setEditingEntry(entry)
    setEntryFormOpen(true)
  }

  function handleDeleteEntry(entry: LedgerEntry) {
    setDeletingEntry(entry)
    setDeleteDialogOpen(true)
  }

  function handleEditPerson() {
    if (!selectedPerson) return
    setEditingPerson(selectedPerson)
  }

  function handleDeletePerson() {
    if (!selectedPerson) return
    setDeletingPerson(selectedPerson)
    setDeletePersonDialogOpen(true)
  }

  useLedgerShortcuts({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onAddEntry: selectedPerson ? handleAddEntry : undefined,
    onSettle:
      selectedPerson && selectedPerson.direction !== 'SETTLED' ? () => setSettleDialogOpen(true) : undefined,
    onEscape: () => {
      if (settleDialogOpen || deleteDialogOpen || deletePersonDialogOpen) return // Radix already closes these
      if (entryFormOpen) {
        setEntryFormOpen(false)
        return
      }
      if (editingPerson) {
        setEditingPerson(undefined)
        return
      }
      if (personFormOpen) {
        setPersonFormOpen(false)
        return
      }
      if (selectedPersonId) closeDetail()
    },
  })

  const active = entriesData?.active ?? []
  const settled = entriesData?.settled ?? []

  return (
    <div className="flex min-h-full min-w-0 flex-col lg:flex-row">
      {/* List pane. Hidden on mobile once a person is selected — the detail
          pane becomes the full-screen "pushed" view. Locks to 392px on
          desktop once selected so both panes are visible side by side. */}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-(--gap) p-(--pad-page)',
          selectedPersonId && 'hidden md:flex',
          selectedPersonId ? 'lg:w-[392px] lg:shrink-0 lg:border-r lg:border-border' : 'w-full',
        )}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <KpiCard
            label="You are owed"
            value={formatINR(summary?.youAreOwed ?? 0)}
            sub={`${owedToYouCount} ${owedToYouCount === 1 ? 'person' : 'people'}`}
            tone="var(--income)"
          />
          <KpiCard
            label="You owe"
            value={formatINR(summary?.youOwe ?? 0)}
            sub={`${youOweCount} ${youOweCount === 1 ? 'person' : 'people'}`}
            tone="var(--expense)"
          />
          {/* Hidden once space is tight: mobile always, desktop once the
              detail pane is open. */}
          <KpiCard
            label="Net position"
            value={formatINR(summary?.netPosition ?? 0)}
            sub={`${summary?.settledPeople ?? 0} settled`}
            className={cn('hidden sm:flex', selectedPersonId && 'lg:hidden')}
          />
        </div>

        <LedgerFilterBar
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchInputRef={searchInputRef}
        />

        <PersonForm open={personFormOpen} onClose={() => setPersonFormOpen(false)} />

        {peopleLoading && (
          <div className="flex flex-col gap-(--row-gap)">
            <PersonRowSkeleton />
            <PersonRowSkeleton />
            <PersonRowSkeleton />
          </div>
        )}

        {peopleError && (
          <p className="py-10 text-center text-sm text-destructive">
            Could not load your ledger. Pull down to retry.
          </p>
        )}

        {!peopleLoading && !peopleError && people.length === 0 && (
          <LedgerEmptyState onAdd={handleAddPerson} />
        )}

        {!peopleLoading && !peopleError && people.length > 0 && (
          <div className="flex flex-col gap-(--row-gap)">
            {filteredPeople.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                selected={person.id === selectedPersonId}
                onSelect={selectPerson}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail pane. Only rendered when someone is selected. */}
      {selectedPersonId && (
        <div className="flex min-w-0 flex-1 flex-col gap-(--gap) p-(--pad-page)">
          {entriesLoading && <PersonDetailSkeleton />}

          {!entriesLoading && selectedPerson && (
            <>
              <PersonDetailHeader
                person={selectedPerson}
                onAddEntry={handleAddEntry}
                onSettle={() => setSettleDialogOpen(true)}
                onEdit={handleEditPerson}
                onDelete={handleDeletePerson}
                onClose={closeDetail}
              />

              <PersonForm
                open={!!editingPerson}
                person={editingPerson}
                onClose={() => setEditingPerson(undefined)}
              />

              <EntryForm
                open={entryFormOpen}
                personId={selectedPerson.id}
                firstName={selectedPerson.name.split(' ')[0]}
                entry={editingEntry}
                onClose={() => setEntryFormOpen(false)}
              />

              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="bg-muted px-[15px] py-2.5 font-mono text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground">
                  ACTIVE · {active.length}
                </div>
                {active.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    variant="active"
                    onEdit={handleEditEntry}
                    onDelete={handleDeleteEntry}
                  />
                ))}
                {active.length === 0 && <AllSquareState firstName={selectedPerson.name.split(' ')[0]} />}
              </div>

              {settled.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-border">
                  <div className="bg-muted px-[15px] py-2.5 font-mono text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground">
                    SETTLED · {settled.length}
                  </div>
                  {settled.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} variant="settled" />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <SettleDialog person={selectedPerson} open={settleDialogOpen} onOpenChange={setSettleDialogOpen} />
      {selectedPerson && (
        <DeleteEntryDialog
          entry={deletingEntry}
          personId={selectedPerson.id}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      )}
      <DeletePersonDialog
        person={deletingPerson}
        open={deletePersonDialogOpen}
        onOpenChange={setDeletePersonDialogOpen}
        onDeleted={closeDetail}
      />
    </div>
  )
}

export default function LedgerPage() {
  return (
    <Suspense fallback={null}>
      <LedgerPageContent />
    </Suspense>
  )
}
