import 'server-only'
import type { PrismaClient, LedgerEntry } from '@prisma/client'
import type {
  CreatePersonBody,
  UpdatePersonBody,
  CreateEntryBody,
  UpdateEntryBody,
  SettleBody,
} from './ledger.schema'
import {
  computeBalances,
  summarise,
  netOf,
  amountsEqual,
  type LedgerPersonDTO,
  type LedgerEntryDTO,
  type LedgerSummary,
} from './ledger.balance'
import { httpError } from '@/lib/server/httpError'

function toEntryDTO(entry: LedgerEntry): LedgerEntryDTO {
  return {
    id: entry.id,
    amount: entry.amount,
    type: entry.type,
    date: entry.date.toISOString(),
    note: entry.note,
    settled: entry.settled,
    settledAt: entry.settledAt ? entry.settledAt.toISOString() : null,
    personId: entry.personId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

// The detail route's balance must go through the same computeBalances() path
// as the list route, never a separately-written single-person query, or the
// two views can drift apart.
async function findPersonDTO(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<LedgerPersonDTO> {
  const [person] = await computeBalances(prisma, userId, [id])
  if (!person) throw httpError(404, 'Person not found')
  return person
}

async function assertPersonOwned(
  prisma: PrismaClient,
  userId: string,
  id: string
) {
  const person = await prisma.ledgerPerson.findFirst({ where: { id, userId } })
  if (!person) throw httpError(404, 'Person not found')
  return person
}

async function assertEntryOwned(
  prisma: PrismaClient,
  userId: string,
  id: string
) {
  const entry = await prisma.ledgerEntry.findFirst({ where: { id, userId } })
  if (!entry) throw httpError(404, 'Entry not found')
  return entry
}

export async function listPeople(
  prisma: PrismaClient,
  userId: string
): Promise<{ people: LedgerPersonDTO[]; summary: LedgerSummary }> {
  const people = await computeBalances(prisma, userId)
  return { people, summary: summarise(people) }
}

export async function createPerson(
  prisma: PrismaClient,
  userId: string,
  data: CreatePersonBody
): Promise<LedgerPersonDTO> {
  // Application-level, case-insensitive — not a DB unique constraint, since two
  // real people can legitimately share a name.
  const existing = await prisma.ledgerPerson.findFirst({
    where: { userId, name: { equals: data.name, mode: 'insensitive' } },
  })
  if (existing) throw httpError(409, 'A person with this name already exists')

  const created = await prisma.ledgerPerson.create({
    data: {
      name: data.name,
      phone: data.phone,
      note: data.note,
      color: data.color ?? '#6366f1',
      userId,
    },
  })

  return findPersonDTO(prisma, userId, created.id)
}

export async function getPerson(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<LedgerPersonDTO> {
  return findPersonDTO(prisma, userId, id)
}

export async function updatePerson(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: UpdatePersonBody
): Promise<LedgerPersonDTO> {
  await assertPersonOwned(prisma, userId, id)

  if (data.name) {
    const existing = await prisma.ledgerPerson.findFirst({
      where: {
        userId,
        name: { equals: data.name, mode: 'insensitive' },
        id: { not: id },
      },
    })
    if (existing) throw httpError(409, 'A person with this name already exists')
  }

  await prisma.ledgerPerson.update({ where: { id }, data })

  return findPersonDTO(prisma, userId, id)
}

export async function deletePerson(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<void> {
  // Always succeeds and cascades entries — the warning lives in the frontend
  // confirm dialog, not here.
  await assertPersonOwned(prisma, userId, id)
  await prisma.ledgerPerson.delete({ where: { id } })
}

export async function listPersonEntries(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<{
  person: LedgerPersonDTO
  active: LedgerEntryDTO[]
  settled: LedgerEntryDTO[]
}> {
  const person = await findPersonDTO(prisma, userId, id)

  const entries = await prisma.ledgerEntry.findMany({
    where: { personId: id, userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })

  const active: LedgerEntryDTO[] = []
  const settled: LedgerEntryDTO[] = []
  for (const entry of entries) {
    const dto = toEntryDTO(entry)
    if (entry.settled) settled.push(dto)
    else active.push(dto)
  }

  return { person, active, settled }
}

export async function createEntry(
  prisma: PrismaClient,
  userId: string,
  personId: string,
  data: CreateEntryBody
): Promise<{ entry: LedgerEntryDTO; person: LedgerPersonDTO }> {
  await assertPersonOwned(prisma, userId, personId)

  const created = await prisma.ledgerEntry.create({
    data: {
      amount: data.amount,
      type: data.type,
      date: data.date,
      note: data.note,
      personId,
      userId,
    },
  })

  // Returned together so the client can update its list+detail caches
  // without a refetch.
  const person = await findPersonDTO(prisma, userId, personId)
  return { entry: toEntryDTO(created), person }
}

export async function updateEntry(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: UpdateEntryBody
): Promise<{ entry: LedgerEntryDTO; person: LedgerPersonDTO }> {
  const existing = await assertEntryOwned(prisma, userId, id)

  const { settled, ...rest } = data
  // `settled: false` is the per-entry unsettle escape hatch and nulls settledAt;
  // `settled: true` is a manual override and stamps settledAt now. Omitted
  // (undefined) leaves both fields untouched.
  const settledPatch =
    settled === undefined
      ? {}
      : settled
        ? { settled: true, settledAt: new Date() }
        : { settled: false, settledAt: null }

  const updated = await prisma.ledgerEntry.update({
    where: { id },
    data: { ...rest, ...settledPatch },
  })

  const person = await findPersonDTO(prisma, userId, existing.personId)
  return { entry: toEntryDTO(updated), person }
}

export async function deleteEntry(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<void> {
  await assertEntryOwned(prisma, userId, id)
  await prisma.ledgerEntry.delete({ where: { id } })
}

export async function settlePerson(
  prisma: PrismaClient,
  userId: string,
  personId: string,
  data: SettleBody
): Promise<{
  person: LedgerPersonDTO
  settledCount: number
  settledAmount: number
  settledAt: string
}> {
  await assertPersonOwned(prisma, userId, personId)

  const result = await prisma.$transaction(async (tx) => {
    const active = await tx.ledgerEntry.findMany({
      where: { personId, userId, settled: false },
    })
    if (active.length === 0)
      throw httpError(409, 'No outstanding entries to settle')

    const balance = netOf(active)
    // Both 409s below intentionally share one message class — the client
    // action (reopen the dialog / retry) is identical for either cause.
    if (
      data?.expectedBalance !== undefined &&
      !amountsEqual(balance, data.expectedBalance)
    ) {
      throw httpError(
        409,
        'This balance changed — reopen the dialog and try again'
      )
    }

    const settledAt = new Date()
    const { count } = await tx.ledgerEntry.updateMany({
      where: { personId, userId, settled: false },
      data: { settled: true, settledAt },
    })

    return { settledCount: count, settledAmount: Math.abs(balance), settledAt }
  })

  const person = await findPersonDTO(prisma, userId, personId)

  return {
    person,
    settledCount: result.settledCount,
    settledAmount: result.settledAmount,
    settledAt: result.settledAt.toISOString(),
  }
}
