import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 text-center">
      <p className="text-6xl font-bold text-[var(--accent)] mb-4">404</p>
      <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-2">Page not found</h1>
      <p className="text-[var(--muted-foreground)] mb-8">
        This page doesn&apos;t exist or was moved.
      </p>
      <Button asChild>
        <Link href="/log">Go home</Link>
      </Button>
    </div>
  )
}
