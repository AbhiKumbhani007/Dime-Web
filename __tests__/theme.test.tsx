import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next-themes
const mockSetTheme = vi.fn()
let mockCurrentTheme = 'light'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: mockCurrentTheme, setTheme: mockSetTheme }),
}))

// Mock lib/api/auth
vi.mock('@/lib/api/auth', () => ({
  updateMe: vi.fn().mockResolvedValue({}),
}))

// Mock zustand store
let mockUserTheme: string | undefined = undefined
const mockUpdateUser = vi.fn()

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      user: mockUserTheme !== undefined ? { theme: mockUserTheme } : null,
      updateUser: mockUpdateUser,
    }
    return selector(state)
  }),
}))

import { ThemeSelector } from '@/components/settings/ThemeSelector'
import { ThemeSync } from '@/components/providers/ThemeSync'

beforeEach(() => {
  vi.clearAllMocks()
  mockCurrentTheme = 'light'
  mockUserTheme = undefined
})

describe('ThemeSelector', () => {
  it('renders 6 theme swatches', () => {
    render(<ThemeSelector />)

    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dim/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /midnight/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sunset/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /system/i })).toBeInTheDocument()

    expect(screen.getAllByRole('button')).toHaveLength(6)
  })

  it('clicking a swatch calls setTheme with the correct value', () => {
    render(<ThemeSelector />)

    fireEvent.click(screen.getByRole('button', { name: /dark/i }))

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('active swatch has the active border class', () => {
    mockCurrentTheme = 'midnight'

    render(<ThemeSelector />)

    const midnightButton = screen.getByRole('button', { name: /midnight/i })
    // The active swatch's inner div should have the active border class
    const swatchBox = midnightButton.querySelector('div')
    expect(swatchBox).toHaveClass('border-[var(--accent)]')
  })
})

describe('ThemeSync', () => {
  it('calls setTheme with user.theme on mount when it differs from current theme', () => {
    mockUserTheme = 'sunset'
    mockCurrentTheme = 'light'

    render(<ThemeSync />)

    expect(mockSetTheme).toHaveBeenCalledWith('sunset')
  })

  it('does not call setTheme when user theme matches current theme', () => {
    mockUserTheme = 'light'
    mockCurrentTheme = 'light'

    render(<ThemeSync />)

    expect(mockSetTheme).not.toHaveBeenCalled()
  })

  it('does not call setTheme when there is no user theme', () => {
    mockUserTheme = undefined
    mockCurrentTheme = 'light'

    render(<ThemeSync />)

    expect(mockSetTheme).not.toHaveBeenCalled()
  })
})
