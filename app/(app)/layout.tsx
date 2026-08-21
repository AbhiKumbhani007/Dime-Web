'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { PageLayout } from '@/components/layout/PageLayout'
import { ThemeSync } from '@/components/providers/ThemeSync'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <SessionProvider>
      <PageLayout>
        <ThemeSync />
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
      </PageLayout>
    </SessionProvider>
  )
}
