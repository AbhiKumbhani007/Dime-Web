import { api } from '@/lib/api'

export type LedgerDirection = 'OWED_TO_YOU' | 'YOU_OWE' | 'SETTLED'
export type LedgerEntryType = 'GAVE' | 'RECEIVED'

export interface LedgerPerson {
  id: string
  name: string
  phone: string | null
  note: string | null
  color: string
  balance: number
  direction: LedgerDirection
  activeEntryCount: number
  settledEntryCount: number
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LedgerSummary {
  youAreOwed: number
  youOwe: number
  netPosition: number
  personCount: number
  settledPeople: number
  settledEntries: number
}

export interface LedgerEntry {
  id: string
  amount: number
  type: LedgerEntryType
  date: string
  note: string | null
  settled: boolean
  settledAt: string | null
  personId: string
  createdAt: string
  updatedAt: string
}

export interface CreatePersonInput {
  name: string
  phone?: string
  note?: string
  color?: string
}

export interface UpdatePersonInput {
  name?: string
  phone?: string | null
  note?: string | null
  color?: string
}

export interface CreateEntryInput {
  amount: number
  type: LedgerEntryType
  date: string
  note?: string
}

export interface UpdateEntryInput {
  amount?: number
  type?: LedgerEntryType
  date?: string
  note?: string | null
  settled?: boolean
}

export interface SettleInput {
  expectedBalance?: number
}

export interface SettleResult {
  person: LedgerPerson
  settledCount: number
  settledAmount: number
  settledAt: string
}

export function getLedgerPeople(): Promise<{ people: LedgerPerson[]; summary: LedgerSummary }> {
  return api.get('api/ledger/people').json<{ people: LedgerPerson[]; summary: LedgerSummary }>()
}

export function createLedgerPerson(data: CreatePersonInput): Promise<{ person: LedgerPerson }> {
  return api.post('api/ledger/people', { json: data }).json<{ person: LedgerPerson }>()
}

// Not currently wired to any UI — the design never surfaces a person detail
// fetch, edit, or delete affordance. Kept for API-surface completeness.
export function getLedgerPerson(id: string): Promise<{ person: LedgerPerson }> {
  return api.get(`api/ledger/people/${id}`).json<{ person: LedgerPerson }>()
}

export function updateLedgerPerson(
  id: string,
  data: UpdatePersonInput,
): Promise<{ person: LedgerPerson }> {
  return api.patch(`api/ledger/people/${id}`, { json: data }).json<{ person: LedgerPerson }>()
}

export function deleteLedgerPerson(id: string): Promise<void> {
  return api.delete(`api/ledger/people/${id}`).json<void>()
}

export function getLedgerPersonEntries(
  id: string,
): Promise<{ person: LedgerPerson; active: LedgerEntry[]; settled: LedgerEntry[] }> {
  return api
    .get(`api/ledger/people/${id}/entries`)
    .json<{ person: LedgerPerson; active: LedgerEntry[]; settled: LedgerEntry[] }>()
}

export function createLedgerEntry(
  personId: string,
  data: CreateEntryInput,
): Promise<{ entry: LedgerEntry; person: LedgerPerson }> {
  return api
    .post(`api/ledger/people/${personId}/entries`, { json: data })
    .json<{ entry: LedgerEntry; person: LedgerPerson }>()
}

export function updateLedgerEntry(
  id: string,
  data: UpdateEntryInput,
): Promise<{ entry: LedgerEntry; person: LedgerPerson }> {
  return api
    .patch(`api/ledger/entries/${id}`, { json: data })
    .json<{ entry: LedgerEntry; person: LedgerPerson }>()
}

export function deleteLedgerEntry(id: string): Promise<void> {
  return api.delete(`api/ledger/entries/${id}`).json<void>()
}

export function settleLedgerPerson(personId: string, data?: SettleInput): Promise<SettleResult> {
  return api.post(`api/ledger/people/${personId}/settle`, { json: data ?? {} }).json<SettleResult>()
}
