'use client'

import { useEffect } from 'react'
import { isTypingTarget } from '@/hooks/useKeyboardShortcuts'

interface Options {
  onFocusSearch: () => void
  /** Undefined when nothing is selected — the shortcut becomes a no-op. */
  onAddEntry?: () => void
  /** Undefined when nothing is selected or the person is already settled. */
  onSettle?: () => void
  /** Caller resolves priority: confirm dialog (handled by Radix itself) →
   * open form → detail pane. */
  onEscape: () => void
}

/**
 * `/ledger`-only shortcuts: `/` focus search, `e` add entry, `s` settle,
 * `Esc` close. Lives here rather than the app-wide `useKeyboardShortcuts`
 * (mounted once in PageLayout for 1-5/b/n) because these only make sense on
 * this one screen.
 *
 * Escape is deliberately NOT gated behind `isTypingTarget`, unlike the other
 * three keys — this app's Sheet/Dialog forms get Radix's built-in Escape
 * handling for free, but Ledger's inline-card forms (see PersonForm/EntryForm)
 * don't, so this needs to catch Escape even while a field inside them has focus.
 */
export function useLedgerShortcuts({ onFocusSearch, onAddEntry, onSettle, onEscape }: Options) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape') {
        onEscape()
        return
      }

      if (isTypingTarget(event.target)) return

      if (event.key === '/') {
        event.preventDefault()
        onFocusSearch()
        return
      }
      if (event.key === 'e' && onAddEntry) {
        event.preventDefault()
        onAddEntry()
        return
      }
      if (event.key === 's' && onSettle) {
        event.preventDefault()
        onSettle()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onFocusSearch, onAddEntry, onSettle, onEscape])
}
