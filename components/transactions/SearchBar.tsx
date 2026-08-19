'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useTransactionFiltersStore } from '@/store/useTransactionFiltersStore'

export function SearchBar() {
  const storedSearch = useTransactionFiltersStore((s) => s.search)
  const setSearch = useTransactionFiltersStore((s) => s.setSearch)

  const [value, setValue] = useState(storedSearch)
  const debounced = useDebouncedValue(value, 300)

  useEffect(() => {
    if (debounced !== storedSearch) {
      setSearch(debounced)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <div className="relative px-4 py-2">
      <Search
        aria-hidden
        className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]"
      />
      <Input
        type="search"
        placeholder="Search notes…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-9 pr-9 bg-[var(--input)]"
        aria-label="Search transactions"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="absolute right-7 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
