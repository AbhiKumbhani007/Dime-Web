'use client'

import { useMemo } from 'react'
import { usePageChrome } from '@/components/layout/PageChrome'
import { Wordmark } from '@/components/brand/Wordmark'
import packageJson from '@/package.json'

export default function AboutPage() {
  usePageChrome(useMemo(() => ({ title: 'About' }), []))

  return (
    <div className="flex flex-col items-center gap-3 p-(--pad-page) text-center">
      <Wordmark size="lg" />
      <p className="text-sm text-muted-foreground">Version {packageJson.version}</p>
    </div>
  )
}
