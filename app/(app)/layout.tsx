// Auth guard + bottom nav shell — fully implemented in F03 App Shell phase
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>
}
