import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

let mockPathname = '/settings/appearance'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

const mockUseCategories = vi.fn()
vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => mockUseCategories(),
}))

const mockUseTemplates = vi.fn()
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => mockUseTemplates(),
}))

import { SettingsRail } from '@/components/settings/SettingsRail'

const SECTION_LABELS = ['Appearance', 'Account', 'Data & CSV', 'Categories', 'Templates', 'About']

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname = '/settings/appearance'
  mockUseCategories.mockReturnValue({ data: { categories: [] }, isLoading: false })
  mockUseTemplates.mockReturnValue({ data: { templates: [] }, isLoading: false })
})

describe('SettingsRail — desktop/tablet rail', () => {
  it('renders all 6 sections', () => {
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    expect(within(nav).getAllByRole('link')).toHaveLength(6)
    for (const label of SECTION_LABELS) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
  })

  it('links each section to its route', () => {
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    expect(within(nav).getByText('Appearance').closest('a')).toHaveAttribute('href', '/settings/appearance')
    expect(within(nav).getByText('Account').closest('a')).toHaveAttribute('href', '/settings/account')
    expect(within(nav).getByText('Data & CSV').closest('a')).toHaveAttribute('href', '/settings/data')
    expect(within(nav).getByText('Categories').closest('a')).toHaveAttribute('href', '/settings/categories')
    expect(within(nav).getByText('Templates').closest('a')).toHaveAttribute('href', '/settings/templates')
    expect(within(nav).getByText('About').closest('a')).toHaveAttribute('href', '/settings/about')
  })

  it('marks only the active section current', () => {
    mockPathname = '/settings/categories'
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    expect(within(nav).getByText('Categories').closest('a')).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByText('Appearance').closest('a')).not.toHaveAttribute('aria-current')
  })

  it('treats nested routes under a section as active', () => {
    mockPathname = '/settings/categories/anything'
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    expect(within(nav).getByText('Categories').closest('a')).toHaveAttribute('aria-current', 'page')
  })

  it('shows a live category count badge on the Categories item', () => {
    mockUseCategories.mockReturnValue({
      data: { categories: [{ id: '1' }, { id: '2' }, { id: '3' }] },
      isLoading: false,
    })
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    const categoriesLink = within(nav).getByText('Categories').closest('a') as HTMLElement
    expect(within(categoriesLink).getByText('3')).toBeInTheDocument()
  })

  it('shows no badge on the Categories item when there are no categories', () => {
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    const categoriesLink = within(nav).getByText('Categories').closest('a') as HTMLElement
    expect(categoriesLink.textContent).toBe('Categories')
  })

  it('shows a live template count badge on the Templates item', () => {
    mockUseTemplates.mockReturnValue({
      data: { templates: [{ id: '1' }, { id: '2' }] },
      isLoading: false,
    })
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    const templatesLink = within(nav).getByText('Templates').closest('a') as HTMLElement
    expect(within(templatesLink).getByText('2')).toBeInTheDocument()
  })

  it('shows no badge on the Templates item when there are no templates', () => {
    render(<SettingsRail />)
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    const templatesLink = within(nav).getByText('Templates').closest('a') as HTMLElement
    expect(templatesLink.textContent).toBe('Templates')
  })
})

describe('SettingsRail — mobile row', () => {
  it('renders the same 6 sections through the ChipRow primitive', () => {
    render(<SettingsRail />)
    const group = screen.getByRole('group', { name: /settings sections/i })
    expect(within(group).getAllByRole('link')).toHaveLength(6)
    for (const label of SECTION_LABELS) {
      expect(within(group).getByText(label)).toBeInTheDocument()
    }

    // The ChipRow nesting is load-bearing (see components/ui/chip-row.tsx):
    // an outer `overflow-x-auto` scroller around an inner `w-max` flex row.
    expect(group).toHaveClass('w-max')
    expect(group.parentElement).toHaveClass('overflow-x-auto')
  })
})
