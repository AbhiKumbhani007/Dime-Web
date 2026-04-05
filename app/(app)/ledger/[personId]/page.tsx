export default function PersonDetailPage({ params }: { params: { personId: string } }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold">Person Detail</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">ID: {params.personId}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">Coming soon — F11 Ledger Entries</p>
    </main>
  )
}
