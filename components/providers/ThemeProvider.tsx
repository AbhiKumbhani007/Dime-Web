'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark', 'dim', 'midnight', 'sunset', 'system']}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}
