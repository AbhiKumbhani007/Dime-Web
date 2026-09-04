'use client'

import type { RefObject } from 'react'
import { Search } from 'lucide-react'
import { ChipRow } from '@/components/ui/chip-row'
import type { LedgerDirection } from '@/lib/api/ledger'

export type LedgerFilter = 'ALL' | LedgerDirection

const FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OWED_TO_YOU', label: 'Owes you' },
  { value: 'YOU_OWE', label: 'You owe' },
  { value: 'SETTLED', label: 'Settled' },
]

interface LedgerFilterBarProps {
  filter: LedgerFilter
  onFilterChange: (filter: LedgerFilter) => void
  search: string
  onSearchChange: (value: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
}

export function LedgerFilterBar({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  searchInputRef,
}: LedgerFilterBarProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-[38px] items-center gap-2 rounded-[10px] bg-muted px-3">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Search people"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search people"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <span
          aria-hidden
          className="shrink-0 rounded bg-card px-1.5 py-px font-mono text-[10px] text-muted-foreground"
        >
          /
        </span>
      </div>

      <ChipRow role="radiogroup" label="Filter by balance">
        {FILTERS.map((f) => {
          const selected = f.value === filter
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onFilterChange(f.value)}
              className={`h-8 shrink-0 rounded-lg border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-accent'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </ChipRow>
    </div>
  )
}
