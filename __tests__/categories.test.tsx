import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/categories',
}))

// Mock the categories API
vi.mock('@/lib/api/categories', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

// Mock TanStack Query mutations and queries
const mockCreateMutateAsync = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockInvalidateQueries = vi.fn()

vi.mock('@/hooks/useCategories', () => ({
  CATEGORIES_KEY: ['categories'],
  useCategories: vi.fn(() => ({
    data: { categories: [] },
    isLoading: false,
    error: null,
  })),
  useCreateCategory: vi.fn(() => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  })),
  useUpdateCategory: vi.fn(() => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  })),
  useDeleteCategory: vi.fn(() => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  })),
}))

// Mock @tanstack/react-query to avoid QueryClient requirement
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  useMutation: vi.fn((opts: { mutationFn: unknown }) => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
  QueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import { CategoryChip } from '@/components/categories/CategoryChip'
import { CategoryForm } from '@/components/categories/CategoryForm'
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog'
import CategoriesPage from '@/app/(app)/settings/categories/page'
import type { Category } from '@/lib/api/categories'
import { useCategories } from '@/hooks/useCategories'

const mockCategory: Category = {
  id: 'cat-1',
  name: 'Food',
  emoji: '🍔',
  color: '#ef4444',
  isDefault: false,
  userId: 'user-1',
  createdAt: new Date().toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── 1. CategoryChip renders emoji and name ─────────────────────────────────
describe('CategoryChip', () => {
  it('renders emoji and name correctly', () => {
    render(<CategoryChip category={mockCategory} />)
    expect(screen.getByText('🍔')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('renders edit icon when onEdit prop is provided', () => {
    render(<CategoryChip category={mockCategory} onEdit={vi.fn()} />)
    // Pencil icon from lucide is rendered as SVG
    const chip = screen.getByRole('button')
    expect(chip).toBeInTheDocument()
  })
})

// ─── 2. CategoryForm shows validation error when name is empty ───────────────
describe('CategoryForm', () => {
  it('shows validation error when name is empty on submit', async () => {
    render(
      <CategoryForm
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    // Clear the name field and submit
    const nameInput = screen.getByPlaceholderText('Category name')
    await userEvent.clear(nameInput)

    const saveButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })

    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
  })

  // ─── 3. CategoryForm calls createCategory with correct data ───────────────
  it('calls createCategory API with correct data on valid submit', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({ category: mockCategory })

    render(
      <CategoryForm
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    const nameInput = screen.getByPlaceholderText('Category name')
    await userEvent.type(nameInput, 'Food')

    const saveButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Food' })
      )
    })
  })
})

// ─── 4. DeleteCategoryDialog renders category name ───────────────────────────
describe('DeleteCategoryDialog', () => {
  it('renders the category name in the confirm text', () => {
    render(
      <DeleteCategoryDialog
        open={true}
        onOpenChange={vi.fn()}
        category={mockCategory}
      />
    )

    expect(screen.getByText(/Food/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })
})

// ─── 5. Categories page shows skeleton on loading state ──────────────────────
describe('CategoriesPage', () => {
  it('shows skeleton on loading state', () => {
    const { useCategories: mockUseCategories } = vi.mocked({ useCategories })
    mockUseCategories.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useCategories>)

    render(<CategoriesPage />)

    // Should render skeleton elements (animate-pulse blocks)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
