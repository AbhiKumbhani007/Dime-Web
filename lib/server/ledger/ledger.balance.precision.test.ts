// Adversarial money-precision tests for lib/server/ledger/ledger.balance.ts.
//
// LEARNINGS.md flags Prisma `Float` storage as a known precision risk. This
// file probes whether ledger.balance.ts's EPSILON (±0.005, "half a paisa")
// tolerance actually absorbs realistic float-accumulation error, and — more
// interestingly — whether it's even reachable given the code's own design
// (balances are always rounded to whole cents before EPSILON is consulted).
// No mocked/real Prisma needed — every function here is pure.
import { describe, it, expect } from 'vitest'
import {
  netBalance,
  netOf,
  directionOf,
  amountsEqual,
  EPSILON,
  type LedgerEntryType,
} from './ledger.balance'

function entries(
  spec: Array<[number, LedgerEntryType]>
): Array<{ amount: number; type: LedgerEntryType }> {
  return spec.map(([amount, type]) => ({ amount, type }))
}

describe('netOf: float accumulation error over many entries', () => {
  it('1,000 entries of 0.10 GAVE nets to exactly 100 (not 99.99999999999 or 100.00000000001)', () => {
    const es = entries(Array.from({ length: 1000 }, () => [0.1, 'GAVE']))
    expect(netOf(es)).toBe(100)
  })

  it('10,000 entries of 0.10 GAVE nets to exactly 1000 — still exact at 10x the scale', () => {
    const es = entries(Array.from({ length: 10_000 }, () => [0.1, 'GAVE']))
    expect(netOf(es)).toBe(1000)
  })

  it('the classic 0.1 + 0.2 !== 0.3 float trap: GAVE 0.1, GAVE 0.2 nets to exactly 0.3, not 0.30000000000000004', () => {
    // Raw JS: 0.1 + 0.2 === 0.30000000000000004. Confirms netBalance's
    // Math.round(...*100)/100 genuinely fixes this, not just "close enough".
    expect(0.1 + 0.2).not.toBe(0.3) // sanity: the JS trap is real
    const es = entries([
      [0.1, 'GAVE'],
      [0.2, 'GAVE'],
    ])
    expect(netOf(es)).toBe(0.3)
  })

  it('alternating GAVE 0.7 / RECEIVED 0.7 across 5,000 pairs nets to exactly 0 — no residual drift survives cancellation', () => {
    const es = entries(
      Array.from({ length: 5000 }, (_, i): [number, LedgerEntryType] => [
        0.7,
        i % 2 === 0 ? 'GAVE' : 'RECEIVED',
      ])
    )
    expect(netOf(es)).toBe(0)
    expect(directionOf(netOf(es))).toBe('SETTLED')
  })

  it('a large mixed set (0.10/0.20/0.70/33.33 GAVE and RECEIVED) nets to the exact hand-computed cents value', () => {
    // 400 entries: 100x each of the four amounts, alternating GAVE/RECEIVED
    // with a deliberate 3-entry GAVE-heavy skew so the true balance is
    // non-zero and must match a value computed independently in integer
    // cents (not float), i.e. a ground truth immune to JS's own float math.
    const amounts = [10, 20, 70, 3333] // cents
    let expectedCents = 0
    const spec: Array<[number, LedgerEntryType]> = []
    for (let i = 0; i < 100; i++) {
      for (const cents of amounts) {
        const type: LedgerEntryType = i % 3 === 0 ? 'RECEIVED' : 'GAVE'
        spec.push([cents / 100, type])
        expectedCents += type === 'GAVE' ? cents : -cents
      }
    }
    const expected = Math.round(expectedCents) / 100
    expect(netOf(entries(spec))).toBe(expected)
  })

  it('near the AmountSchema ceiling: many entries at 999,999,999.99 still net exactly (no large-magnitude drift)', () => {
    // AmountSchema caps a single amount at 1_000_000_000; use the largest
    // 2-decimal value just under that repeated enough times to matter.
    const es = entries([
      [999_999_999.99, 'GAVE'],
      [999_999_999.99, 'GAVE'],
      [999_999_999.98, 'RECEIVED'],
    ])
    // 999999999.99*2 - 999999999.98 = 1000000000.00
    expect(netOf(es)).toBe(1_000_000_000)
  })
})

describe('directionOf: the EPSILON band is unreachable through netBalance-rounded values', () => {
  // netBalance() always does Math.round(x*100)/100 before directionOf() ever
  // sees the result (confirmed: directionOf's only two call sites in
  // non-test source are ledger.balance.ts's own computeBalances(), which
  // feeds it netBalance()'s output). That means the smallest possible
  // non-zero |balance| directionOf can ever actually be asked to classify is
  // 0.01 — already twice EPSILON (0.005). The ±EPSILON tolerance band
  // between 0 and 0.005 the code comments call "guards against Float
  // accumulation error" is therefore dead in practice for any balance that
  // went through netBalance(); it only matters for amountsEqual() comparing
  // against an externally-supplied, not-necessarily-rounded expectedBalance
  // (see the describe block below). Documented here as a finding, not
  // asserted as a bug — see the report for full reasoning.
  it('the smallest possible non-zero netBalance() output (0.01) already clears EPSILON on its own', () => {
    const smallest = netBalance(0.01, 0)
    expect(smallest).toBe(0.01)
    expect(smallest).toBeGreaterThan(EPSILON)
    expect(directionOf(smallest)).toBe('OWED_TO_YOU')
  })

  it('a balance of exactly 0 (not -0) reads SETTLED even when reached via GAVE > RECEIVED that cancel out', () => {
    const balance = netBalance(500.5, 500.5)
    expect(Object.is(balance, -0)).toBe(false) // must be +0, not -0
    expect(directionOf(balance)).toBe('SETTLED')
  })

  it('float noise that nets to a tiny negative residual before rounding still rounds to +0/SETTLED, never a false YOU_OWE', () => {
    // Construct gave/received sums whose raw floating-point difference is a
    // hair below zero (e.g. -1e-13) purely from summation order — netOf's
    // internal Math.round(...*100)/100 must still land on 0, not -0.01.
    const es = entries([
      [0.1, 'GAVE'],
      [0.1, 'GAVE'],
      [0.1, 'GAVE'],
      [0.30000000000000004, 'RECEIVED'], // exact raw sum of the three 0.1s
    ])
    const balance = netOf(es)
    expect(balance).toBe(0)
    expect(directionOf(balance)).toBe('SETTLED')
  })
})

describe('amountsEqual: the real float-tolerance boundary, against an unrounded client-supplied expectedBalance', () => {
  // This is where EPSILON actually matters: settlePerson() compares its own
  // freshly netOf()-computed (already-rounded) balance against a client-
  // supplied `expectedBalance` that arrived over JSON and was never
  // guaranteed to be pre-rounded to cents.
  it('absorbs a naive (non-rounded) client-side sum of the classic 0.1+0.2 pattern', () => {
    const serverBalance = netOf(
      entries([
        [0.1, 'GAVE'],
        [0.2, 'GAVE'],
      ])
    ) // exactly 0.3
    const clientNaiveSum = 0.1 + 0.2 // 0.30000000000000004, unrounded
    expect(amountsEqual(serverBalance, clientNaiveSum)).toBe(true)
  })

  it('is inclusive at exactly EPSILON (±0.005) and rejects just past it', () => {
    expect(amountsEqual(100, 100 + EPSILON)).toBe(true)
    expect(amountsEqual(100, 100 - EPSILON)).toBe(true)
    expect(amountsEqual(100, 100 + EPSILON + 0.001)).toBe(false)
    expect(amountsEqual(100, 100 - EPSILON - 0.001)).toBe(false)
  })

  it('does NOT absorb a genuinely stale expectedBalance one full cent off — the guard must still fire', () => {
    expect(amountsEqual(300, 299.99)).toBe(false)
    expect(amountsEqual(300, 300.01)).toBe(false)
  })
})
