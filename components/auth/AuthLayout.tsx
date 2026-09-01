import { Zap, Shield, Handshake } from 'lucide-react'
import { BrandMark, Wordmark } from '@/components/brand/Wordmark'

const SELL_POINTS = [
  { icon: Zap, label: 'Four taps to log a transaction' },
  { icon: Shield, label: 'Budgets that warn before you overshoot' },
  { icon: Handshake, label: 'A ledger for money between friends' },
]

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

/**
 * Split-screen shell for login and signup: a fixed marketing panel beside the
 * form. Below `md` the panel is dropped entirely and replaced by a compact
 * lockup above the heading — a 46%-width column is unusable on a phone.
 */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen bg-background">
      <aside className="hidden w-[46%] shrink-0 flex-col justify-between border-r border-border bg-card px-13 py-14 md:flex">
        <Wordmark size="md" />

        <div className="flex max-w-[400px] flex-col gap-[22px]">
          <h1 className="text-[34px]/[1.2] font-bold tracking-[-0.035em] text-pretty">
            Every rupee, where it went.
          </h1>
          <p className="text-[15px]/[1.65] text-muted-foreground text-pretty">
            Log spending in five seconds, set limits that actually warn you, and keep track of who
            owes whom — without a spreadsheet.
          </p>

          <ul className="flex flex-col gap-[11px] pt-1.5">
            {SELL_POINTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-[11px]">
                <span
                  aria-hidden
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent"
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13.5px]">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
          <span>Works offline</span>
          <span aria-hidden>·</span>
          <span>Installs as an app</span>
          <span aria-hidden>·</span>
          <span>CSV in and out</span>
        </p>
      </aside>

      <div className="scrollbar-thin flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-[22px] md:p-10">
        <div className="animate-fade flex w-full max-w-[390px] flex-col gap-5">
          {/* The brand only needs restating where the panel is gone. */}
          <span className="flex items-center gap-[11px] pb-1 md:hidden">
            <BrandMark size="md" />
            <span className="text-[22px] font-bold tracking-[-0.03em]">Paisa</span>
          </span>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-[25px] font-bold tracking-[-0.025em]">{title}</h1>
            <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </main>
  )
}
