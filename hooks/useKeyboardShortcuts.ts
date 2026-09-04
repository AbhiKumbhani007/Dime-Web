'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { NAV_ITEMS } from '@/lib/nav'
import { usePreferencesStore } from '@/store/usePreferencesStore'

/** Elements that swallow single-key shortcuts because the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

interface Options {
  /** Fires on `n` — the create action for the current screen, if it has one. */
  onPrimaryAction?: () => void
}

/**
 * App-wide keyboard map: `1`–`5` jump between the five destinations, `b`
 * toggles the sidebar, `n` opens the current screen's create form.
 *
 * Escape is deliberately NOT handled here. Every overlay that needs it — Radix
 * dialogs, sheets, popovers — already closes on Escape and stops propagation,
 * so a global handler would either double-fire or close two layers at once.
 * While the user is typing, Escape blurs the field instead.
 */
export function useKeyboardShortcuts({ onPrimaryAction }: Options = {}) {
  const router = useRouter()
  const toggleNav = usePreferencesStore((s) => s.toggleNav)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never steal browser and OS chords (⌘K, ctrl-R, …).
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (isTypingTarget(event.target)) {
        if (event.key === 'Escape') (event.target as HTMLElement).blur()
        return
      }

      const destination = NAV_ITEMS.find((item) => item.key === event.key)
      if (destination) {
        event.preventDefault()
        router.push(destination.href)
        return
      }

      if (event.key === 'b') {
        event.preventDefault()
        toggleNav()
        return
      }

      if (event.key === 'n' && onPrimaryAction) {
        event.preventDefault()
        onPrimaryAction()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router, toggleNav, onPrimaryAction])
}
