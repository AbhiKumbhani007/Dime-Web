'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLedgerPeople,
  createLedgerPerson,
  updateLedgerPerson,
  deleteLedgerPerson,
  getLedgerPersonEntries,
  createLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  settleLedgerPerson,
  type CreatePersonInput,
  type UpdatePersonInput,
  type CreateEntryInput,
  type UpdateEntryInput,
  type SettleInput,
  type LedgerPerson,
  type LedgerEntry,
} from '@/lib/api/ledger'

export const LEDGER_PEOPLE_KEY = ['ledger', 'people'] as const
export const ledgerEntriesKey = (personId: string) => ['ledger', 'people', personId, 'entries'] as const

type PeopleResponse = Awaited<ReturnType<typeof getLedgerPeople>>
type EntriesResponse = Awaited<ReturnType<typeof getLedgerPersonEntries>>

export function useLedgerPeople() {
  return useQuery({
    queryKey: LEDGER_PEOPLE_KEY,
    queryFn: getLedgerPeople,
    // Balances move whenever an entry is added/settled, so this is kept as
    // fresh as Budgets rather than the longer Categories staleTime.
    staleTime: 30 * 1000,
  })
}

export function useLedgerEntries(personId?: string) {
  return useQuery({
    queryKey: ledgerEntriesKey(personId ?? ''),
    queryFn: () => getLedgerPersonEntries(personId!),
    enabled: !!personId,
    staleTime: 30 * 1000,
  })
}

export function useCreateLedgerPerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createLedgerPerson,

    // Optimistic insert so the new row lands immediately. A brand-new person
    // always starts at zero/SETTLED — never guessed, always true by construction.
    onMutate: async (input: CreatePersonInput) => {
      await queryClient.cancelQueries({ queryKey: LEDGER_PEOPLE_KEY })
      const previous = queryClient.getQueryData<PeopleResponse>(LEDGER_PEOPLE_KEY)

      const now = new Date().toISOString()
      const optimistic: LedgerPerson = {
        id: `optimistic-${now}`,
        name: input.name,
        phone: input.phone ?? null,
        note: input.note ?? null,
        color: input.color ?? '#6366f1',
        balance: 0,
        direction: 'SETTLED',
        activeEntryCount: 0,
        settledEntryCount: 0,
        lastActivityAt: null,
        createdAt: now,
        updatedAt: now,
      }

      queryClient.setQueryData<PeopleResponse>(LEDGER_PEOPLE_KEY, (old) =>
        old
          ? {
              people: [optimistic, ...old.people],
              summary: { ...old.summary, personCount: old.summary.personCount + 1 },
            }
          : {
              people: [optimistic],
              summary: {
                youAreOwed: 0,
                youOwe: 0,
                netPosition: 0,
                personCount: 1,
                settledPeople: 1,
                settledEntries: 0,
              },
            },
      )

      return { previous }
    },

    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(LEDGER_PEOPLE_KEY, context.previous)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}

// Not currently wired to any UI (see lib/api/ledger.ts) — kept for parity so
// the hook layer mirrors the full API surface.
export function useUpdateLedgerPerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePersonInput }) => updateLedgerPerson(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}

export function useDeleteLedgerPerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteLedgerPerson(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}

export function useCreateLedgerEntry(personId: string) {
  const queryClient = useQueryClient()
  const entriesKey = ledgerEntriesKey(personId)

  return useMutation({
    mutationFn: (data: CreateEntryInput) => createLedgerEntry(personId, data),

    onMutate: async (input: CreateEntryInput) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previous = queryClient.getQueryData<EntriesResponse>(entriesKey)

      const now = new Date().toISOString()
      const optimistic: LedgerEntry = {
        id: `optimistic-${now}`,
        amount: input.amount,
        type: input.type,
        date: input.date,
        note: input.note ?? null,
        settled: false,
        settledAt: null,
        personId,
        createdAt: now,
        updatedAt: now,
      }

      queryClient.setQueryData<EntriesResponse>(entriesKey, (old) =>
        old ? { ...old, active: [optimistic, ...old.active] } : old,
      )

      return { previous }
    },

    // The response carries the real entry and the recomputed person — never
    // guess balance/direction client-side, write exactly what the server sent.
    onSuccess: ({ entry, person }) => {
      queryClient.setQueryData<EntriesResponse>(entriesKey, (old) =>
        old
          ? { ...old, person, active: [entry, ...old.active.filter((e) => !e.id.startsWith('optimistic-'))] }
          : old,
      )
      queryClient.setQueryData<PeopleResponse>(LEDGER_PEOPLE_KEY, (old) =>
        old ? { ...old, people: old.people.map((p) => (p.id === person.id ? person : p)) } : old,
      )
    },

    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(entriesKey, context.previous)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: entriesKey })
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}

export function useUpdateLedgerEntry(personId: string) {
  const queryClient = useQueryClient()
  const entriesKey = ledgerEntriesKey(personId)

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEntryInput }) => updateLedgerEntry(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previous = queryClient.getQueryData<EntriesResponse>(entriesKey)

      queryClient.setQueryData<EntriesResponse>(entriesKey, (old) => {
        if (!old) return old
        const patch = (e: LedgerEntry) => (e.id === id ? { ...e, ...data } : e)
        return { ...old, active: old.active.map(patch), settled: old.settled.map(patch) }
      })

      return { previous }
    },

    // settled:false (or :true) can move a row between the active/settled
    // lists, so the response's entry is placed into whichever list its own
    // `settled` flag now says, not patched in place.
    onSuccess: ({ entry, person }) => {
      queryClient.setQueryData<EntriesResponse>(entriesKey, (old) => {
        if (!old) return old
        const active = old.active.filter((e) => e.id !== entry.id)
        const settled = old.settled.filter((e) => e.id !== entry.id)
        return {
          ...old,
          person,
          active: entry.settled ? active : [entry, ...active],
          settled: entry.settled ? [entry, ...settled] : settled,
        }
      })
      queryClient.setQueryData<PeopleResponse>(LEDGER_PEOPLE_KEY, (old) =>
        old ? { ...old, people: old.people.map((p) => (p.id === person.id ? person : p)) } : old,
      )
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(entriesKey, context.previous)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: entriesKey })
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}

export function useDeleteLedgerEntry(personId: string) {
  const queryClient = useQueryClient()
  const entriesKey = ledgerEntriesKey(personId)

  return useMutation({
    mutationFn: (id: string) => deleteLedgerEntry(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previous = queryClient.getQueryData<EntriesResponse>(entriesKey)

      queryClient.setQueryData<EntriesResponse>(entriesKey, (old) =>
        old
          ? {
              ...old,
              active: old.active.filter((e) => e.id !== id),
              settled: old.settled.filter((e) => e.id !== id),
            }
          : old,
      )

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(entriesKey, context.previous)
    },

    // DELETE returns 204 with no body — there's no fresh `person` to sync from,
    // so the corrected balance can only come from a real refetch here.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: entriesKey })
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}

export function useSettleLedgerPerson(personId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data?: SettleInput) => settleLedgerPerson(personId, data),

    // Not optimistic — settling changes every active entry at once, not worth
    // guessing client-side. The returned `person` is synced immediately so the
    // summary chip doesn't flicker; the entries list still needs a real
    // refetch, since the response has no entries array to move rows from.
    onSuccess: ({ person }) => {
      queryClient.setQueryData<PeopleResponse>(LEDGER_PEOPLE_KEY, (old) =>
        old ? { ...old, people: old.people.map((p) => (p.id === person.id ? person : p)) } : old,
      )
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ledgerEntriesKey(personId) })
      queryClient.invalidateQueries({ queryKey: LEDGER_PEOPLE_KEY })
    },
  })
}
