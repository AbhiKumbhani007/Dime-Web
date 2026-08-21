import { request as pwRequest, type APIRequestContext } from '@playwright/test'

export const API_URL = 'http://localhost:4000'

export interface TestUser {
  email: string
  password: string
  name: string
  userId: string
  accessToken: string
  refreshToken: string
}

/** Mint a fresh user via the register endpoint. Unique email per call. */
export async function registerTestUser(req: APIRequestContext): Promise<TestUser> {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const email = `e2e-${ts}-${rand}@dime.test`
  const password = 'Password123!'
  const name = 'E2E User'

  const res = await req.post(`${API_URL}/api/auth/register`, {
    data: { email, password, name },
  })
  if (!res.ok()) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`)
  }
  const body = await res.json()
  return {
    email,
    password,
    name,
    userId: body.user.id,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  }
}

/** Authenticated request context for a test user. */
export async function authedContext(user: TestUser): Promise<APIRequestContext> {
  return await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${user.accessToken}` },
  })
}

export interface SeedCategory {
  id: string
  name: string
  emoji: string
  color: string
  isDefault: boolean
}

/** Read the user's categories (18 defaults seed automatically on register). */
export async function listCategories(
  ctx: APIRequestContext
): Promise<SeedCategory[]> {
  const res = await ctx.get('/api/categories')
  if (!res.ok()) throw new Error(`listCategories: ${res.status()}`)
  const body = await res.json()
  return body.categories
}

/** Create a transaction via API — used for seeding test data. */
export async function createTx(
  ctx: APIRequestContext,
  input: {
    amount: number
    date: string
    note?: string
    isIncome: boolean
    categoryId: string
  }
) {
  const res = await ctx.post('/api/transactions', { data: input })
  if (!res.ok()) throw new Error(`createTx: ${res.status()} ${await res.text()}`)
  return (await res.json()).transaction
}
