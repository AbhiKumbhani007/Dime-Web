import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Density = 'comfortable' | 'dense'

interface PreferencesState {
  /** Row/padding scale for Log, Budgets and Ledger. Ignored below `md`. */
  density: Density
  setDensity: (density: Density) => void

  /** Sidebar expanded (240px) vs rail (64px). Toggled by the panel button or `b`. */
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  toggleNav: () => void

  /** Disables the page-fade transition in `app/(app)/layout.tsx`. Default off. */
  reducedMotion: boolean
  setReducedMotion: (reducedMotion: boolean) => void
}

/**
 * UI preferences that outlive a page view. Persisted so the shell doesn't
 * flip back to defaults on every navigation.
 *
 * Theme deliberately lives elsewhere — it is server-backed via `user.theme`
 * and next-themes, see components/providers/ThemeSync.tsx.
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      setDensity: (density) => set({ density }),

      navOpen: true,
      setNavOpen: (navOpen) => set({ navOpen }),
      toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),

      reducedMotion: false,
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    { name: 'paisa-preferences' },
  ),
)
