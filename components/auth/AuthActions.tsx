import Link from 'next/link'
import { Loader2 } from 'lucide-react'

interface SubmitProps {
  busy: boolean
  label: string
  busyLabel: string
}

export function AuthSubmit({ busy, label, busyLabel }: SubmitProps) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex h-12 cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary text-[14.5px] font-semibold text-primary-foreground hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {busy ? busyLabel : label}
    </button>
  )
}

/**
 * Google sign-in is designed but the provider is not configured, so the button
 * ships visibly disabled and badged rather than silently failing — DESIGN.md 8
 * lists it as a known gap. It previously alerted "Coming soon" on click.
 */
export function GoogleButton() {
  return (
    <>
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">or</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        disabled
        title="Google sign-in is not wired up yet"
        className="flex h-[46px] cursor-not-allowed items-center justify-center gap-2.5 rounded-xl border border-border bg-transparent text-[13.5px] font-medium text-muted-foreground opacity-60"
      >
        <span aria-hidden className="block h-[17px] w-[17px] shrink-0 rounded-full bg-muted" />
        Continue with Google
        <span className="rounded-full bg-muted px-[7px] py-0.5 text-[10px] font-medium">soon</span>
      </button>
    </>
  )
}

interface SwitchProps {
  prompt: string
  href: string
  label: string
}

export function AuthSwitch({ prompt, href, label }: SwitchProps) {
  return (
    <p className="flex items-center justify-center gap-[7px] text-[13px] text-muted-foreground">
      {prompt}
      <Link href={href} className="font-semibold text-accent hover:underline">
        {label}
      </Link>
    </p>
  )
}
