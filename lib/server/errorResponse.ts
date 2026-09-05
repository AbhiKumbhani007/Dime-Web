import 'server-only'
import { NextResponse } from 'next/server'

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export function apiError(status: number, code: ErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}
