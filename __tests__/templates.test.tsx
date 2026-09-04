import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/templates',
}))

// Mock the templates API
vi.mock('@/lib/api/templates', () => ({
  getTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}))

// Mock the categories API + hook (TemplateForm's category picker)
vi.mock('@/lib/api/categories', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

vi.mock('@/hooks/useCategories', () => ({
  CATEGORIES_KEY: ['categories'],
  useCategories: vi.fn(() => ({
    data: {
      categories: [
        {
          id: 'cat-1',
          name: 'Food',
          emoji: '🍔',
          color: '#ef4444',
          isDefault: false,
          userId: 'user-1',
          createdAt: new Date().toISOString(),
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
}))

// Note: unlike categories.test.tsx, this file does not need to mock
// @tanstack/react-query directly — every module under test reaches it only
// through the fully-mocked hooks/useTemplates and hooks/useCategories below.

// Mock toast module
vi.mock('@/lib/toast', () => ({
  toastAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

const mockCreateMutateAsync = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()

vi.mock('@/hooks/useTemplates', () => ({
  TEMPLATES_KEY: ['templates'],
  useTemplates: vi.fn(() => ({
    data: { templates: [] },
    isLoading: false,
    error: null,
  })),
  useCreateTemplate: vi.fn(() => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  })),
  useUpdateTemplate: vi.fn(() => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  })),
  useDeleteTemplate: vi.fn(() => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  })),
}))

import { TemplateChip } from '@/components/templates/TemplateChip'
import { TemplateChipRow } from '@/components/templates/TemplateChipRow'
import { TemplateForm } from '@/components/templates/TemplateForm'
import { DeleteTemplateDialog } from '@/components/templates/DeleteTemplateDialog'
import TemplatesPage from '@/app/(app)/settings/templates/page'
import type { Template } from '@/lib/api/templates'
import { useTemplates } from '@/hooks/useTemplates'
import { toastSuccess } from '@/lib/toast'

const mockTemplate: Template = {
  id: 'tpl-1',
  label: 'Morning coffee',
  emoji: '☕',
  amount: 150,
  note: null,
  isIncome: false,
  usageCount: 4,
  lastUsedAt: new Date().toISOString(),
  categoryId: 'cat-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  category: { id: 'cat-1', name: 'Food', emoji: '🍔', color: '#ef4444' },
}

const mockTemplateNoAmount: Template = {
  id: 'tpl-2',
  label: 'Cash gift',
  emoji: '🧾',
  amount: null,
  note: null,
  isIncome: true,
  usageCount: 0,
  lastUsedAt: null,
  categoryId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  category: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── 1. TemplateChip renders emoji, label and amount ────────────────────────
describe('TemplateChip', () => {
  it('renders emoji, label and formatted amount', () => {
    render(<TemplateChip template={mockTemplate} />)
    expect(screen.getByText('☕')).toBeInTheDocument()
    expect(screen.getByText('Morning coffee')).toBeInTheDocument()
    expect(screen.getByText(/150/)).toBeInTheDocument()
  })

  it('omits the amount when the template has none', () => {
    render(<TemplateChip template={mockTemplateNoAmount} />)
    expect(screen.getByText('Cash gift')).toBeInTheDocument()
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
  })
})

// ─── 2. TemplateChipRow — renders chips and fires onSelect ──────────────────
describe('TemplateChipRow', () => {
  it('renders nothing when there are no templates', () => {
    vi.mocked(useTemplates).mockReturnValueOnce({
      data: { templates: [] as Template[] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTemplates>)

    const { container } = render(<TemplateChipRow onSelect={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('tapping a chip calls onSelect with that template (prefill behavior)', () => {
    vi.mocked(useTemplates).mockReturnValueOnce({
      data: { templates: [mockTemplate] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTemplates>)

    const onSelect = vi.fn()
    render(<TemplateChipRow onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Morning coffee'))
    expect(onSelect).toHaveBeenCalledWith(mockTemplate)
  })
})

// ─── 3. TemplateForm shows validation error when label is empty ─────────────
describe('TemplateForm', () => {
  it('shows validation error when label is empty on submit', async () => {
    render(<TemplateForm open={true} onOpenChange={vi.fn()} />)

    const saveButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(screen.getByText('Label is required')).toBeInTheDocument()
    })
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
  })

  // ─── 4. TemplateForm calls createTemplate with correct data ───────────────
  it('calls createTemplate API with correct data on valid submit', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({ template: mockTemplate })

    render(<TemplateForm open={true} onOpenChange={vi.fn()} />)

    const labelInput = screen.getByPlaceholderText('e.g. Morning coffee')
    await userEvent.type(labelInput, 'Weekly grocery run')

    const saveButton = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Weekly grocery run', amount: null })
      )
    })
  })

  // ─── 5. TemplateForm edit mode calls updateTemplate ────────────────────────
  it('in edit mode, pre-fills fields and calls updateTemplate on submit', async () => {
    mockUpdateMutateAsync.mockResolvedValueOnce({ template: mockTemplate })
    const onOpenChange = vi.fn()

    render(
      <TemplateForm open={true} onOpenChange={onOpenChange} template={mockTemplate} />
    )

    expect(screen.getByDisplayValue('Morning coffee')).toBeInTheDocument()
    expect(screen.getByDisplayValue('150')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tpl-1',
          data: expect.objectContaining({ label: 'Morning coffee' }),
        })
      )
    })
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})

// ─── 6. DeleteTemplateDialog ─────────────────────────────────────────────────
describe('DeleteTemplateDialog', () => {
  it('renders the template label in the confirm text', () => {
    render(
      <DeleteTemplateDialog open={true} onOpenChange={vi.fn()} template={mockTemplate} />
    )
    expect(screen.getByText(/Morning coffee/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('calls deleteTemplate and toastSuccess on confirm', async () => {
    mockDeleteMutateAsync.mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()

    render(
      <DeleteTemplateDialog open={true} onOpenChange={onOpenChange} template={mockTemplate} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('tpl-1')
    })
    expect(toastSuccess).toHaveBeenCalledWith('Template deleted')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// ─── 7. TemplatesPage ─────────────────────────────────────────────────────────
describe('TemplatesPage', () => {
  it('shows skeleton on loading state', () => {
    vi.mocked(useTemplates).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useTemplates>)

    render(<TemplatesPage />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows the empty state when there are no templates', () => {
    vi.mocked(useTemplates).mockReturnValueOnce({
      data: { templates: [] as Template[] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTemplates>)

    render(<TemplatesPage />)
    expect(screen.getByText('No templates yet')).toBeInTheDocument()
  })

  it('renders a row per template with category, amount and usage', () => {
    vi.mocked(useTemplates).mockReturnValue({
      data: { templates: [mockTemplate, mockTemplateNoAmount] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTemplates>)

    render(<TemplatesPage />)

    expect(screen.getByText('Morning coffee')).toBeInTheDocument()
    expect(screen.getByText('Cash gift')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit Morning coffee')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete Morning coffee')).toBeInTheDocument()
  })

  it('switching the sort control re-queries useTemplates with the new sort', () => {
    vi.mocked(useTemplates).mockReturnValue({
      data: { templates: [mockTemplate] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTemplates>)

    render(<TemplatesPage />)

    expect(useTemplates).toHaveBeenCalledWith('usage')

    fireEvent.click(screen.getByRole('radio', { name: 'A–Z' }))

    expect(useTemplates).toHaveBeenCalledWith('label')
  })

  it('clicking the delete icon opens the confirm dialog for that template', () => {
    vi.mocked(useTemplates).mockReturnValue({
      data: { templates: [mockTemplate] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTemplates>)

    render(<TemplatesPage />)

    fireEvent.click(screen.getByLabelText('Delete Morning coffee'))
    expect(screen.getByText('Delete Template')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument()
  })
})
