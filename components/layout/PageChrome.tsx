'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export interface PageChrome {
  /** Overrides the route-derived title. */
  title?: string
  /** Secondary line beside the title. Hidden on mobile. */
  meta?: string
  /** Back button in the top bar — mobile master-detail. */
  onBack?: () => void
  /**
   * The screen's create action. Rendered as a labelled top-bar button from
   * `md` up and as a FAB below it, and bound to the `n` shortcut — pages
   * declare it once and get all three.
   */
  primaryAction?: { label: string; onClick: () => void }
}

interface PageChromeContextValue {
  chrome: PageChrome
  setChrome: (chrome: PageChrome) => void
}

const PageChromeContext = createContext<PageChromeContextValue | null>(null)

export function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, setChrome] = useState<PageChrome>({})
  const value = useMemo(() => ({ chrome, setChrome }), [chrome])
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>
}

/** Read the current chrome. For the shell — pages should use `usePageChrome`. */
export function usePageChromeValue(): PageChrome {
  return useContext(PageChromeContext)?.chrome ?? {}
}

/**
 * Declare this screen's top-bar content and primary action.
 *
 * Callers must memoise `chrome` (or pass a stable object), since it is the
 * effect's dependency. Clears on unmount so a screen without chrome doesn't
 * inherit the previous one's action.
 */
export function usePageChrome(chrome: PageChrome) {
  const context = useContext(PageChromeContext)
  const setChrome = context?.setChrome

  useEffect(() => {
    if (!setChrome) return
    setChrome(chrome)
    return () => setChrome({})
  }, [setChrome, chrome])
}
