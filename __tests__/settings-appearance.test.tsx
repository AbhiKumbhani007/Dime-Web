import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSetReducedMotion = vi.fn()
const mockSetDensity = vi.fn()
const mockSetNavOpen = vi.fn()

interface MockPreferencesState {
  reducedMotion: boolean
  density: 'comfortable' | 'dense'
  navOpen: boolean
  setReducedMotion: typeof mockSetReducedMotion
  setDensity: typeof mockSetDensity
  setNavOpen: typeof mockSetNavOpen
}

let mockState: MockPreferencesState

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (selector: (s: MockPreferencesState) => unknown) => selector(mockState),
}))

import { AppearancePreferences } from '@/components/settings/AppearancePreferences'

beforeEach(() => {
  vi.clearAllMocks()
  mockState = {
    reducedMotion: false,
    density: 'comfortable',
    navOpen: true,
    setReducedMotion: mockSetReducedMotion,
    setDensity: mockSetDensity,
    setNavOpen: mockSetNavOpen,
  }
})

describe('AppearancePreferences', () => {
  it('renders exactly 3 switches', () => {
    render(<AppearancePreferences />)
    expect(screen.getAllByRole('switch')).toHaveLength(3)
  })

  it('reflects current store state in each switch', () => {
    mockState = {
      ...mockState,
      reducedMotion: true,
      density: 'dense',
      navOpen: false,
    }
    render(<AppearancePreferences />)

    expect(screen.getByRole('switch', { name: /reduced motion/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: /dense layout/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: /expanded sidebar/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggling "Reduced motion" calls setReducedMotion with the new value', async () => {
    const user = userEvent.setup()
    render(<AppearancePreferences />)

    await user.click(screen.getByRole('switch', { name: /reduced motion/i }))

    expect(mockSetReducedMotion).toHaveBeenCalledTimes(1)
    expect(mockSetReducedMotion).toHaveBeenCalledWith(true)
  })

  it('toggling "Dense layout" writes the existing density preference', async () => {
    const user = userEvent.setup()
    render(<AppearancePreferences />)

    await user.click(screen.getByRole('switch', { name: /dense layout/i }))

    expect(mockSetDensity).toHaveBeenCalledTimes(1)
    expect(mockSetDensity).toHaveBeenCalledWith('dense')
  })

  it('toggling "Dense layout" off goes back to comfortable', async () => {
    mockState = { ...mockState, density: 'dense' }
    const user = userEvent.setup()
    render(<AppearancePreferences />)

    await user.click(screen.getByRole('switch', { name: /dense layout/i }))

    expect(mockSetDensity).toHaveBeenCalledWith('comfortable')
  })

  it('toggling "Expanded sidebar" writes the existing navOpen preference', async () => {
    const user = userEvent.setup()
    render(<AppearancePreferences />)

    await user.click(screen.getByRole('switch', { name: /expanded sidebar/i }))

    expect(mockSetNavOpen).toHaveBeenCalledTimes(1)
    expect(mockSetNavOpen).toHaveBeenCalledWith(false)
  })
})
