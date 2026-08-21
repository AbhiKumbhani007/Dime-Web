import { create } from 'zustand'

export interface TransactionFilters {
  search: string
  categoryId: string | null
  isIncome: boolean | null
  from: string | null
  to: string | null
}

interface TransactionFiltersState extends TransactionFilters {
  setSearch: (search: string) => void
  setCategoryId: (categoryId: string | null) => void
  setIsIncome: (isIncome: boolean | null) => void
  setFrom: (from: string | null) => void
  setTo: (to: string | null) => void
  setDateRange: (from: string | null, to: string | null) => void
  reset: () => void
}

const initialState: TransactionFilters = {
  search: '',
  categoryId: null,
  isIncome: null,
  from: null,
  to: null,
}

export const useTransactionFiltersStore = create<TransactionFiltersState>()((set) => ({
  ...initialState,

  setSearch: (search) => set({ search }),
  setCategoryId: (categoryId) => set({ categoryId }),
  setIsIncome: (isIncome) => set({ isIncome }),
  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),
  setDateRange: (from, to) => set({ from, to }),

  reset: () => set({ ...initialState }),
}))
