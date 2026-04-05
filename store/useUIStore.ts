import { create } from 'zustand'

interface TransactionFilters {
  search: string
  categoryId: string | null
  isIncome: boolean | null
  from: string | null
  to: string | null
}

interface UIState {
  // Transaction filters
  filters: TransactionFilters
  setFilter: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void
  resetFilters: () => void

  // Active modals / sheets
  isAddTransactionOpen: boolean
  setAddTransactionOpen: (open: boolean) => void

  isAddBudgetOpen: boolean
  setAddBudgetOpen: (open: boolean) => void

  isAddPersonOpen: boolean
  setAddPersonOpen: (open: boolean) => void
}

const defaultFilters: TransactionFilters = {
  search: '',
  categoryId: null,
  isIncome: null,
  from: null,
  to: null,
}

export const useUIStore = create<UIState>((set) => ({
  filters: defaultFilters,

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  resetFilters: () => set({ filters: defaultFilters }),

  isAddTransactionOpen: false,
  setAddTransactionOpen: (open) => set({ isAddTransactionOpen: open }),

  isAddBudgetOpen: false,
  setAddBudgetOpen: (open) => set({ isAddBudgetOpen: open }),

  isAddPersonOpen: false,
  setAddPersonOpen: (open) => set({ isAddPersonOpen: open }),
}))
