'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { PageLayout } from '@/components/layout/PageLayout'
import { PageChromeProvider } from '@/components/layout/PageChrome'
import { ThemeSync } from '@/components/providers/ThemeSync'
import { usePreferencesStore } from '@/store/usePreferencesStore'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion)

  return (
    <SessionProvider>
      {/* The chrome provider sits outside PageLayout so the shell can read what
          the current page publishes via usePageChrome(). */}
      <PageChromeProvider>
        <PageLayout>
          <ThemeSync />
          {/* Reduced motion (Settings → Appearance) skips the fade/slide entirely
              rather than just zeroing the duration, so no motion styles ever
              apply to the DOM. */}
          {reducedMotion ? (
            <div key={pathname}>{children}</div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          )}
        </PageLayout>
      </PageChromeProvider>
    </SessionProvider>
  )
}
