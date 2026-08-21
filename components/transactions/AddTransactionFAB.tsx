'use client'

import { Fab } from '@/components/layout/Fab'

interface AddTransactionFABProps {
  onClick: () => void
}

export function AddTransactionFAB({ onClick }: AddTransactionFABProps) {
  return <Fab onClick={onClick} label="Add transaction" />
}
