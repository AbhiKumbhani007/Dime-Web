import { api } from '@/lib/api'

export interface Transaction {
  id: string
  amount: number
  date: string
  note: string | null
  isIncome: boolean
  categoryId: string
  userId: string
  createdAt: string
  updatedAt: string
}

export interface TransactionListParams {
  cursor?: string
  limit?: number
  search?: string
  categoryId?: string
  isIncome?: boolean
  from?: string
  to?: string
}

export interface TransactionListResponse {
  items: Transaction[]
  nextCursor: string | null
}

export interface CreateTransactionInput {
  amount: number
  date: string
  note?: string
  isIncome: boolean
  categoryId: string
}

export type UpdateTransactionInput = Partial<CreateTransactionInput>

function buildSearchParams(params: TransactionListParams): URLSearchParams {
  const sp = new URLSearchParams()
  if (params.cursor) sp.set('cursor', params.cursor)
  if (params.limit !== undefined) sp.set('limit', String(params.limit))
  if (params.search) sp.set('search', params.search)
  if (params.categoryId) sp.set('categoryId', params.categoryId)
  if (params.isIncome !== undefined) sp.set('isIncome', String(params.isIncome))
  if (params.from) sp.set('from', params.from)
  if (params.to) sp.set('to', params.to)
  return sp
}

export function listTransactions(
  params: TransactionListParams = {}
): Promise<TransactionListResponse> {
  return api
    .get('api/transactions', { searchParams: buildSearchParams(params) })
    .json<TransactionListResponse>()
}

export function getTransaction(id: string): Promise<{ transaction: Transaction }> {
  return api.get(`api/transactions/${id}`).json<{ transaction: Transaction }>()
}

export function createTransaction(
  input: CreateTransactionInput
): Promise<{ transaction: Transaction }> {
  return api.post('api/transactions', { json: input }).json<{ transaction: Transaction }>()
}

export function updateTransaction(
  id: string,
  patch: UpdateTransactionInput
): Promise<{ transaction: Transaction }> {
  return api
    .patch(`api/transactions/${id}`, { json: patch })
    .json<{ transaction: Transaction }>()
}

export function deleteTransaction(id: string): Promise<void> {
  return api.delete(`api/transactions/${id}`).json<void>()
}
