import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation before importing components
const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockPathname = '/log'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => mockPathname,
}))

// Mock the auth API
vi.mock('@/lib/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  updateMe: vi.fn(),
  updatePassword: vi.fn(),
  deleteAccount: vi.fn(),
}))

// Mock zustand store to avoid SSR issues
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: null,
    accessToken: null,
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    setAccessToken: vi.fn(),
  })),
}))

import LoginPage from '@/app/(auth)/login/page'
import { BottomNav } from '@/components/layout/BottomNav'

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname = '/log'
})

describe('Login form', () => {
  it('shows password validation error when password is too short', async () => {
    const { login } = await import('@/lib/api/auth')
    render(<LoginPage />)

    await userEvent.clear(screen.getByLabelText(/email/i))
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.clear(screen.getByLabelText(/password/i))
    await userEvent.type(screen.getByLabelText(/password/i), 'short')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    })

    expect(login).not.toHaveBeenCalled()
  })

  it('shows email validation error when email is invalid', async () => {
    const { login } = await import('@/lib/api/auth')
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.type(screen.getByLabelText(/password/i), 'validpassword')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument()
    })

    expect(login).not.toHaveBeenCalled()
  })
})

describe('BottomNav', () => {
  it('renders all 5 navigation tabs', () => {
    render(<BottomNav />)

    expect(screen.getByText('Log')).toBeInTheDocument()
    expect(screen.getByText('Insights')).toBeInTheDocument()
    expect(screen.getByText('Budgets')).toBeInTheDocument()
    expect(screen.getByText('Ledger')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('applies active class to the current route item', () => {
    mockPathname = '/log'
    render(<BottomNav />)

    const logLink = screen.getByRole('link', { name: /log/i })
    expect(logLink).toHaveAttribute('aria-current', 'page')

    // Other tabs should not be active
    const insightsLink = screen.getByRole('link', { name: /insights/i })
    expect(insightsLink).not.toHaveAttribute('aria-current', 'page')
  })
})
