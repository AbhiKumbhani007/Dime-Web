'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a value that only updates after `delay` ms have elapsed since the
 * last change to `value`. Useful for debouncing search inputs.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
