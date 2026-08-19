'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Check } from 'lucide-react'
import { updateMe } from '@/lib/api/auth'
import { useAuthStore } from '@/store/useAuthStore'

interface ThemeOption {
  value: string
  label: string
  bg: string
  accent: string
}

const THEMES: ThemeOption[] = [
  { value: 'light',    label: 'Light',    bg: '#ffffff',                                              accent: '#6366f1' },
  { value: 'dark',     label: 'Dark',     bg: '#09090b',                                              accent: '#818cf8' },
  { value: 'dim',      label: 'Dim',      bg: '#1c1c1e',                                              accent: '#a5b4fc' },
  { value: 'midnight', label: 'Midnight', bg: '#0f172a',                                              accent: '#818cf8' },
  { value: 'sunset',   label: 'Sunset',   bg: '#1a0a00',                                              accent: '#f97316' },
  { value: 'system',   label: 'System',   bg: 'linear-gradient(135deg, #ffffff 50%, #09090b 50%)',    accent: '#6366f1' },
]

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const updateUser = useAuthStore((s) => s.updateUser)
  const [saving, setSaving] = useState<string | null>(null)

  function handleSelect(value: string) {
    setTheme(value)
    updateUser({ theme: value })
    setSaving(value)
    updateMe({ theme: value })
      .catch(() => {})
      .finally(() => setSaving(null))
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {THEMES.map((t) => {
        const isActive = theme === t.value
        const isGradient = t.value === 'system'

        return (
          <button
            key={t.value}
            onClick={() => handleSelect(t.value)}
            disabled={saving === t.value}
            className="flex flex-col items-center gap-1 w-20"
            aria-label={t.label}
          >
            <div
              className={`w-full rounded-xl overflow-hidden border-2 transition-all ${
                isActive
                  ? 'border-[var(--accent)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <div
                className="h-14 flex items-center justify-center relative"
                style={
                  isGradient
                    ? { background: 'linear-gradient(135deg, #ffffff 50%, #09090b 50%)' }
                    : { backgroundColor: t.bg }
                }
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: t.accent }}
                />
                {isActive && (
                  <div className="absolute top-1 right-1">
                    <Check size={12} color="white" strokeWidth={3} />
                  </div>
                )}
              </div>
            </div>
            <p
              className={`text-xs text-center ${
                isActive
                  ? 'text-[var(--foreground)] font-medium'
                  : 'text-[var(--muted-foreground)]'
              }`}
            >
              {t.label}
            </p>
          </button>
        )
      })}
    </div>
  )
}
