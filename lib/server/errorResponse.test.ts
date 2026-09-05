import { describe, it, expect } from 'vitest'
import { apiError } from './errorResponse'

describe('apiError', () => {
  it.each([
    [400, 'VALIDATION_ERROR', 'Name is required'],
    [401, 'UNAUTHORIZED', 'Invalid or missing token'],
    [404, 'NOT_FOUND', 'Category not found'],
    [409, 'CONFLICT', 'Category name already exists'],
    [429, 'RATE_LIMITED', 'Too many requests, try again later'],
    [500, 'INTERNAL_ERROR', 'An unexpected error occurred'],
  ] as const)(
    'builds a %i %s response with the standardized envelope',
    async (status, code, message) => {
      const response = apiError(status, code, message)

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({
        error: { code, message },
      })
    }
  )
})
