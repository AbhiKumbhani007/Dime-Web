import { redirect } from 'next/navigation'

/**
 * Deep-link redirect only — the real two-pane UI lives at `/ledger`, with the
 * selected person in the `person` search param (not the path). Keeping
 * selection out of the path means `pathname` never changes when a person is
 * selected, so the app shell's `AnimatePresence key={pathname}` (see
 * `app/(app)/layout.tsx`) never replays its page-fade for a pane swap.
 */
export default async function LedgerPersonRedirect({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const { personId } = await params
  redirect(`/ledger?person=${personId}`)
}
