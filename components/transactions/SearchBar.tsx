'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
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
    <div className="flex h-[38px] min-w-[220px] flex-1 items-center gap-2 rounded-[10px] bg-muted px-3 md:max-w-[340px]">
      <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        placeholder="Search notes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Search transactions"
        className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
