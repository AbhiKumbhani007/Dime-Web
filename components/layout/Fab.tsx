'use client'

import { useEffect, useState } from 'react'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Plus } from 'lucide-react'

interface FabProps {
  onClick: () => void
  /** Accessible name for the button, e.g. "Add budget". */
  label: string
}

/** Floating action button that hides on scroll-down and reappears on scroll-up. */
export function Fab({ onClick, label }: FabProps) {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  const [lastY, setLastY] = useState(0)

  useMotionValueEvent(scrollY, 'change', (current) => {
    const delta = current - lastY
    if (Math.abs(delta) < 8) return
    if (current > 60 && delta > 0) {
      setHidden(true)
    } else if (delta < 0) {
      setHidden(false)
    }
    setLastY(current)
  })

  // Listen to main scrollable container too (PageLayout uses a <main> with overflow-y-auto)
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    let prev = main.scrollTop
    function onScroll() {
      if (!main) return
      const curr = main.scrollTop
      const delta = curr - prev
      if (Math.abs(delta) < 8) return
      if (curr > 60 && delta > 0) setHidden(true)
      else if (delta < 0) setHidden(false)
      prev = curr
    }
    main.addEventListener('scroll', onScroll)
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      initial={{ y: 0 }}
      animate={{ y: hidden ? 120 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed right-4 bottom-20 lg:bottom-6 z-40 h-14 w-14 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-transform"
    >
      <Plus className="h-6 w-6" />
    </motion.button>
  )
}
