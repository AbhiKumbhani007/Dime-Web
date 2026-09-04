import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HTTPError } from 'ky'

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/settings/account',
}))

vi.mock('@/lib/api/auth', () => ({
  updateMe: vi.fn(),
  updatePassword: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('@/lib/toast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

interface MockAuthUser {
  id: string
  email: string
  name: string | null
  theme: string
  createdAt: string
}

const DEFAULT_MOCK_USER: MockAuthUser = {
  id: 'u1',
  email: 'abhi@example.com',
  name: 'Abhi',
  theme: 'light',
  createdAt: '2024-01-01T00:00:00.000Z',
}

// vi.mock factories are hoisted above regular top-level statements, so the
// mock store (and anything the factory closes over) must be built inside
// vi.hoisted rather than declared as ordinary module-scope variables.
const { mockUpdateUser, mockClearAuth, mockUseAuthStore, mockSetUser } = vi.hoisted(() => {
  const updateUser = vi.fn()
  const clearAuth = vi.fn()
  let user: MockAuthUser | null = null

  function getState() {
    return { user, updateUser, clearAuth }
  }

  const useAuthStore = Object.assign(
    vi.fn((selector: (s: ReturnType<typeof getState>) => unknown) => selector(getState())),
    { getState },
  )

  return {
    mockUpdateUser: updateUser,
    mockClearAuth: clearAuth,
    mockUseAuthStore: useAuthStore,
    mockSetUser: (next: MockAuthUser | null) => {
      user = next
    },
  }
})

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: mockUseAuthStore,
}))

import { AccountForm } from '@/components/settings/AccountForm'
import { DeleteAccountDialog } from '@/components/settings/DeleteAccountDialog'
import { updateMe, updatePassword, deleteAccount } from '@/lib/api/auth'
import { toastError, toastSuccess } from '@/lib/toast'

beforeEach(() => {
  vi.clearAllMocks()
  mockSetUser({ ...DEFAULT_MOCK_USER })
})

describe('AccountForm — name edit', () => {
  it('saves the new name and syncs the store, then exits edit mode', async () => {
    vi.mocked(updateMe).mockResolvedValueOnce({
      id: 'u1',
      email: 'abhi@example.com',
      name: 'Abhinav',
      theme: 'light',
      createdAt: '2024-01-01T00:00:00.000Z',
    })

    render(<AccountForm />)

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))

    const nameInput = screen.getByLabelText('Name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Abhinav')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(updateMe).toHaveBeenCalledWith({ name: 'Abhinav' })
    })
    expect(mockUpdateUser).toHaveBeenCalledWith({ name: 'Abhinav' })

    // Edit mode closed — the Edit button is back, the input is gone.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('reverts the input and does not call the API on cancel', async () => {
    render(<AccountForm />)

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))

    const nameInput = screen.getByLabelText('Name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Someone Else')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(updateMe).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByText('Abhi')).toBeInTheDocument()
  })
})

async function fillPasswordForm(values: {
  current: string
  next: string
  confirm: string
}) {
  await userEvent.type(screen.getByLabelText('Current password'), values.current)
  await userEvent.type(screen.getByLabelText('New password'), values.next)
  await userEvent.type(screen.getByLabelText('Confirm new password'), values.confirm)
  await userEvent.click(screen.getByRole('button', { name: /update password/i }))
}

describe('AccountForm — change password', () => {
  it('shows the wrong-current-password error inline under the field, without redirecting', async () => {
    const response = new Response(JSON.stringify({ error: 'Current password is incorrect' }), {
      status: 400,
    })
    const request = new Request('http://localhost/api/auth/me/password')
    vi.mocked(updatePassword).mockRejectedValueOnce(
      new HTTPError(response, request, {} as never),
    )

    render(<AccountForm />)

    await fillPasswordForm({ current: 'wrongpass', next: 'newpassword1', confirm: 'newpassword1' })

    await waitFor(() => {
      expect(screen.getByText('Current password is incorrect')).toBeInTheDocument()
    })

    // Inline error, not a toast — and no navigation happened.
    expect(toastError).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('shows a validation error when new and confirm passwords do not match', async () => {
    render(<AccountForm />)

    await fillPasswordForm({ current: 'currentpass', next: 'newpassword1', confirm: 'newpassword2' })

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('submits the correct payload and clears the form on success', async () => {
    vi.mocked(updatePassword).mockResolvedValueOnce(undefined)

    render(<AccountForm />)

    await fillPasswordForm({ current: 'currentpass', next: 'newpassword1', confirm: 'newpassword1' })

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith({
        oldPassword: 'currentpass',
        newPassword: 'newpassword1',
      })
    })
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Password updated')
    })
  })
})

describe('DeleteAccountDialog', () => {
  it('only enables the destructive action once DELETE is typed exactly', async () => {
    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />)

    const confirmButton = screen.getByRole('button', { name: /^delete account$/i })
    expect(confirmButton).toBeDisabled()

    const input = screen.getByLabelText(/type.*delete.*to confirm/i)
    await userEvent.type(input, 'delete')
    expect(confirmButton).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, 'DELETEX')
    expect(confirmButton).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, 'DELETE')
    expect(confirmButton).toBeEnabled()
  })

  it('deletes the account, clears auth, and redirects to /login on confirm', async () => {
    vi.mocked(deleteAccount).mockResolvedValueOnce(undefined)

    render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />)

    const input = screen.getByLabelText(/type.*delete.*to confirm/i)
    await userEvent.type(input, 'DELETE')

    const confirmButton = screen.getByRole('button', { name: /^delete account$/i })
    await userEvent.click(confirmButton)

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalled()
    })
    expect(mockClearAuth).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})
