# Dime — Technical Design Document (TDD)

> **Version:** 1.0
> **Date:** 2026-03-31
> **Scope:** Full V1 — Expense Tracker + Ledger + Analytics + Multi-theme + CSV
> **Architecture:** Two separate repositories — `dime-api` (backend) + `dime-web` (frontend)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack — Backend (dime-api)](#3-tech-stack--backend-dime-api)
4. [Tech Stack — Frontend (dime-web)](#4-tech-stack--frontend-dime-web)
5. [Database Schema](#5-database-schema)
6. [API Design](#6-api-design)
7. [Authentication Flow](#7-authentication-flow)
8. [Development Phases](#8-development-phases)
   - Backend Phases B1–B8
   - Frontend Phases F1–F11
9. [Phase Dependency Map](#9-phase-dependency-map)
10. [Environment Variables](#10-environment-variables)
11. [Conventions & Standards](#11-conventions--standards)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        dime-web (Next.js)                    │
│  Browser / PWA                                               │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │
│  │   Log    │ │ Insights │ │Budgets │ │Ledger  │ │Settings│ │
│  └──────────┘ └──────────┘ └────────┘ └────────┘ └───────┘ │
│         TanStack Query v5  +  Zustand v5                     │
└─────────────────────┬────────────────────────────────────────┘
                      │ HTTPS REST (JSON)
                      │ Authorization: Bearer <JWT>
┌─────────────────────▼────────────────────────────────────────┐
│                     dime-api (Fastify)                        │
│  Route Handlers → Service Layer → Prisma ORM                 │
└─────────────────────┬────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────┐
│                  PostgreSQL Database                          │
│  dev: local  |  prod: self-hosted AWS RDS / VPS              │
└──────────────────────────────────────────────────────────────┘
```

### Key Decisions
- **Separate repos**: `dime-api` (REST API) and `dime-web` (Next.js frontend)
- **Auth**: JWT — backend issues access token + refresh token on login
- **No offline V1**: Network-first, no sync queue
- **INR only**: All amounts in Indian Rupees
- **Account required**: No local-only mode

---

## 2. Repository Structure

### dime-api
```
dime-api/
├── src/
│   ├── server.ts              ← Fastify app entry point
│   ├── config.ts              ← env vars, constants
│   ├── plugins/
│   │   ├── prisma.ts          ← Prisma plugin (decorates fastify.prisma)
│   │   ├── jwt.ts             ← JWT plugin (@fastify/jwt)
│   │   └── cors.ts            ← CORS config
│   ├── hooks/
│   │   └── authenticate.ts    ← preHandler hook — verify JWT, attach user
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.schema.ts  ← Zod validation schemas
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── budgets/
│   │   ├── analytics/
│   │   ├── ledger/
│   │   ├── settings/
│   │   └── csv/
│   └── lib/
│       └── password.ts         ← bcrypt helpers
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

### dime-web
```
dime-web/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx          ← BottomNav + auth guard
│   │   ├── log/page.tsx
│   │   ├── insights/page.tsx
│   │   ├── budgets/page.tsx
│   │   ├── ledger/
│   │   │   ├── page.tsx
│   │   │   └── [personId]/page.tsx
│   │   └── settings/page.tsx
│   ├── layout.tsx              ← ThemeProvider, QueryProvider
│   └── globals.css
├── components/
│   ├── ui/                     ← shadcn/ui (auto-generated)
│   ├── transactions/
│   ├── budgets/
│   ├── ledger/
│   ├── charts/
│   └── shared/
├── lib/
│   ├── api.ts                  ← axios/fetch client (attaches JWT)
│   ├── auth.ts                 ← token storage, refresh logic
│   └── utils/
│       ├── currency.ts
│       └── date.ts
├── store/
│   ├── useUIStore.ts
│   └── useAuthStore.ts
├── hooks/
├── public/
│   ├── manifest.json
│   └── icons/
├── .env.local
└── next.config.ts
```

---

## 3. Tech Stack — Backend (dime-api)

| Layer | Technology | Reason |
|---|---|---|
| Runtime | Node.js 22 LTS | Stable, fast |
| Framework | **Fastify 5** | Faster than Express, TypeScript-first, schema validation built-in |
| ORM | **Prisma 6** | Type-safe queries, excellent migrations, great DX |
| Database | **PostgreSQL 17** | Reliable, powerful, self-hostable |
| Auth | **@fastify/jwt** (RS256) + bcryptjs | Stateless JWT, signed with asymmetric keys |
| Validation | **Zod** | Runtime schema validation for request bodies |
| Password | **bcryptjs** | Hash passwords at rest |
| CORS | @fastify/cors | Configurable origins for dev/prod |
| Testing | **Vitest** + @fastify/inject | Unit + integration tests |
| Linting | ESLint + Prettier | Consistent code style |
| Process | **tsx** (dev) / compiled JS (prod) | Fast dev reloads |

---

## 4. Tech Stack — Frontend (dime-web)

| Layer | Technology | Reason |
|---|---|---|
| Framework | **Next.js 16.2** (App Router) | SSR, routing, image optimization |
| Language | **TypeScript 5** | Type safety |
| Styling | **Tailwind CSS v4** | Utility-first, mobile-first |
| UI Components | **shadcn/ui** | Accessible, customizable, owned code |
| Animation | **framer-motion** | Smooth page/component transitions |
| Charts | **Recharts** | SVG-based, good mobile rendering |
| Icons | **lucide-react** | Consistent icon set |
| Server State | **TanStack Query v5** | Caching, background refetch, mutations |
| Client State | **Zustand v5** | UI state, auth tokens, filters |
| Theming | **next-themes** + CSS variables | Multi-theme support |
| CSV | **papaparse** | Import + export |
| HTTP Client | **ky** | Lightweight fetch wrapper, interceptors for JWT |
| Form | **react-hook-form** + Zod | Validation, performance |
| Testing | **Vitest** + **Testing Library** | Component + hook tests |
| PWA | Web App Manifest + next-pwa | Installable on Android/iOS |

---

## 5. Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Auth ────────────────────────────────────────────────────

model User {
  id           String         @id @default(cuid())
  email        String         @unique
  name         String?
  passwordHash String?        // null if OAuth (future)
  theme        String         @default("system")
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  transactions  Transaction[]
  categories    Category[]
  budgets       Budget[]
  templates     Template[]
  ledgerPersons LedgerPerson[]
  ledgerEntries LedgerEntry[]
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ─── Expense Tracking ─────────────────────────────────────────

model Category {
  id           String        @id @default(cuid())
  name         String
  emoji        String
  color        String        @default("#6366f1")
  isDefault    Boolean       @default(false)
  userId       String
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  budgets      Budget[]
  createdAt    DateTime      @default(now())

  @@unique([userId, name])
}

model Transaction {
  id         String   @id @default(cuid())
  amount     Float
  date       DateTime
  note       String?
  isIncome   Boolean  @default(false)
  userId     String
  categoryId String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id])

  @@index([userId, date])
  @@index([userId, categoryId])
}

model Budget {
  id         String     @id @default(cuid())
  name       String
  emoji      String
  colour     String     @default("#6366f1")
  type       BudgetType
  amount     Float
  startDate  DateTime   @default(now())
  userId     String
  categoryId String
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id])
}

model Template {
  id         String   @id @default(cuid())
  label      String
  amount     Float?
  note       String?
  isIncome   Boolean  @default(false)
  userId     String
  categoryId String?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum BudgetType {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

// ─── Ledger ───────────────────────────────────────────────────

model LedgerPerson {
  id        String        @id @default(cuid())
  name      String
  phone     String?
  note      String?
  color     String        @default("#6366f1")
  userId    String
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries LedgerEntry[]
}

model LedgerEntry {
  id        String          @id @default(cuid())
  amount    Float
  type      LedgerEntryType
  date      DateTime
  note      String?
  settled   Boolean         @default(false)
  settledAt DateTime?
  personId  String
  userId    String
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  person LedgerPerson @relation(fields: [personId], references: [id], onDelete: Cascade)
  user   User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, settled])
  @@index([personId])
}

enum LedgerEntryType {
  GAVE      // you gave them money → they owe you
  RECEIVED  // you received money from them → you owe them
}
```

---

## 6. API Design

Base URL: `https://api.dime.app` (prod) / `http://localhost:4000` (dev)

All protected routes require: `Authorization: Bearer <accessToken>`

### Auth
```
POST   /api/auth/register         → { email, name, password } → { user, accessToken, refreshToken }
POST   /api/auth/login            → { email, password } → { user, accessToken, refreshToken }
POST   /api/auth/refresh          → { refreshToken } → { accessToken }
POST   /api/auth/logout           → invalidates refreshToken
GET    /api/auth/me               → current user profile
PATCH  /api/auth/me               → update name, theme
PATCH  /api/auth/me/password      → change password
DELETE /api/auth/me               → delete account + all data
```

### Categories
```
GET    /api/categories            → list all user categories
POST   /api/categories            → create custom category
PATCH  /api/categories/:id        → update name/emoji/color
DELETE /api/categories/:id        → delete (only if no transactions)
```

### Transactions
```
GET    /api/transactions          → list with filters:
                                    ?page, ?limit (default 20)
                                    ?from, ?to (date range)
                                    ?categoryId
                                    ?isIncome (true/false)
                                    ?search (note text)
POST   /api/transactions          → create
PATCH  /api/transactions/:id      → update
DELETE /api/transactions/:id      → delete
```

### Budgets
```
GET    /api/budgets               → list all budgets with current spend
POST   /api/budgets               → create
PATCH  /api/budgets/:id           → update
DELETE /api/budgets/:id           → delete
GET    /api/budgets/:id/progress  → { budget, spent, remaining, percent }
```

### Analytics
```
GET    /api/analytics/overview
       ?from, ?to
       → { totalIncome, totalExpense, netBalance,
           transactionCount, avgDailySpend }

GET    /api/analytics/by-period
       ?period=weekly|monthly|yearly
       ?date (reference date, defaults to today)
       → { labels[], income[], expense[], net[] }

GET    /api/analytics/by-category
       ?from, ?to
       ?isIncome (default false)
       → [{ category, total, percent, count }]

GET    /api/analytics/trends
       ?months (default 6)
       → [{ month, income, expense, net }]

GET    /api/analytics/top-days
       ?from, ?to
       ?limit (default 10)
       → [{ date, total }]

GET    /api/analytics/budget-vs-actual
       → [{ budget, allocated, spent, remaining, percent }]
```

### Ledger
```
GET    /api/ledger/people                    → list people with net balance
       → { people[], summary: { youAreOwed, youOwe } }
POST   /api/ledger/people                    → create person
PATCH  /api/ledger/people/:id               → update name/phone/note/color
DELETE /api/ledger/people/:id               → delete person + entries

GET    /api/ledger/people/:id/entries        → list entries (with ?settled filter)
POST   /api/ledger/people/:id/entries        → add entry { amount, type, date, note }
PATCH  /api/ledger/entries/:id              → edit entry
DELETE /api/ledger/entries/:id              → delete entry
POST   /api/ledger/people/:id/settle        → mark all unsettled entries as settled
```

### CSV
```
GET    /api/csv/export            → download CSV of all transactions
       ?from, ?to (optional date range)
       Content-Type: text/csv

POST   /api/csv/import            → upload CSV file
       multipart/form-data
       → { imported, skipped, errors[] }
```

### Settings
```
GET    /api/settings              → { theme }
PATCH  /api/settings              → { theme }
```

---

## 7. Authentication Flow

```
REGISTER / LOGIN
  Client → POST /api/auth/login { email, password }
  Server → verify password (bcrypt) → issue:
    accessToken  (JWT, 15 min expiry)
    refreshToken (opaque, 30 days, stored in DB)
  Client → store accessToken in memory (Zustand)
           store refreshToken in httpOnly cookie (or localStorage)

AUTHENTICATED REQUEST
  Client → attach header: Authorization: Bearer <accessToken>
  Server preHandler hook → verify JWT → attach req.user

TOKEN REFRESH (on 401 from any request)
  TanStack Query onError → trigger refresh
  Client → POST /api/auth/refresh { refreshToken }
  Server → validate refreshToken in DB → issue new accessToken
  Client → retry original request with new accessToken

LOGOUT
  Client → POST /api/auth/logout { refreshToken }
  Server → delete refreshToken from DB
  Client → clear Zustand auth state
```

---

## 8. Development Phases

Each phase is independently completable. Agents can pick up any phase once its dependencies are met.

---

### BACKEND PHASES

---

#### B1 — Project Setup & Base Infrastructure
**Repo:** `dime-api`
**Depends on:** nothing

**Deliverables:**
- Initialize Fastify 5 project with TypeScript
- Configure ts + eslint + prettier + nodemon/tsx
- Prisma setup with PostgreSQL connection
- Register plugins: `@fastify/jwt`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`
- Global error handler (ZodError → 400, Prisma errors → mapped status codes)
- Health check endpoint: `GET /health → { status: "ok", timestamp }`
- Env config with validation (Zod)
- Docker Compose file for local PostgreSQL

**Acceptance criteria:**
- `npm run dev` starts server on port 4000
- `GET /health` returns 200
- `npx prisma migrate dev` runs without errors
- ESLint + Prettier pass

---

#### B2 — Auth Module
**Repo:** `dime-api`
**Depends on:** B1

**Deliverables:**
- Prisma migrations: `User`, `RefreshToken` models
- `POST /api/auth/register` — hash password, create user, seed default categories, issue tokens
- `POST /api/auth/login` — verify password, issue tokens
- `POST /api/auth/refresh` — rotate refresh token
- `POST /api/auth/logout` — revoke refresh token
- `GET /api/auth/me` — return current user
- `PATCH /api/auth/me` — update name/theme
- `PATCH /api/auth/me/password` — change password (verify old password)
- `DELETE /api/auth/me` — delete account (cascades all data)
- `authenticate` preHandler hook — verify JWT, attach `req.user`
- Zod schemas for all request bodies

**Acceptance criteria:**
- Register returns 201 with tokens
- Login with wrong password returns 401
- Protected route without token returns 401
- Refresh with invalid token returns 401
- Logout invalidates refresh token (subsequent refresh returns 401)

---

#### B3 — Categories Module
**Repo:** `dime-api`
**Depends on:** B2

**Deliverables:**
- Prisma migration: `Category` model
- Seed function: 18 default categories (12 expense + 6 income) auto-created on user register
- `GET /api/categories` — list all user categories
- `POST /api/categories` — create custom category (validate unique name per user)
- `PATCH /api/categories/:id` — update emoji/name/color (ownership check)
- `DELETE /api/categories/:id` — delete only if no linked transactions/budgets; return 409 otherwise

**Acceptance criteria:**
- New user has 18 categories automatically
- Cannot create duplicate category name for same user
- Cannot delete category that has transactions
- Returns 404 for category belonging to another user

---

#### B4 — Transactions Module
**Repo:** `dime-api`
**Depends on:** B3

**Deliverables:**
- Prisma migration: `Transaction` model + indexes
- `GET /api/transactions` with pagination + all filters (date range, category, isIncome, search)
- `POST /api/transactions` — create (validate categoryId belongs to user)
- `PATCH /api/transactions/:id` — update (ownership check)
- `DELETE /api/transactions/:id` — delete (ownership check)
- Prisma query helpers: `buildTransactionWhere(userId, filters)`

**Acceptance criteria:**
- Returns only transactions belonging to authenticated user
- Date range filter works correctly
- Text search on note field (case-insensitive)
- Pagination returns correct page/limit/total
- Returns 404 for transaction belonging to another user

---

#### B5 — Budgets Module
**Repo:** `dime-api`
**Depends on:** B4

**Deliverables:**
- Prisma migration: `Budget` model
- `GET /api/budgets` — list budgets, each with computed current spend (sum transactions in active period)
- `POST /api/budgets` — create budget
- `PATCH /api/budgets/:id` — update
- `DELETE /api/budgets/:id` — delete
- `GET /api/budgets/:id/progress` — { budget, spent, remaining, percent, daysRemaining }
- Period calculation logic:
  - DAILY: today's date range
  - WEEKLY: current Mon–Sun
  - MONTHLY: current calendar month
  - YEARLY: current Jan–Dec

**Acceptance criteria:**
- Budget spend reflects only transactions in active period
- Progress percent caps at correct max (can exceed 100%)
- Period boundary logic correct (weekly starts Monday)

---

#### B6 — Analytics Module
**Repo:** `dime-api`
**Depends on:** B4

**Deliverables:**
- `GET /api/analytics/overview` — totals for a date range
- `GET /api/analytics/by-period` — bar chart data (weekly/monthly/yearly grouped buckets)
- `GET /api/analytics/by-category` — category breakdown with percent
- `GET /api/analytics/trends` — N months of income/expense/net
- `GET /api/analytics/top-days` — highest spending days
- `GET /api/analytics/budget-vs-actual` — all budgets vs actual spend
- All queries use raw Prisma aggregates (`groupBy`, `_sum`, `_count`)

**Acceptance criteria:**
- by-period weekly returns exactly 7 data points
- by-period monthly returns correct days in month
- by-category percents sum to ~100%
- trends returns correct number of month buckets
- All queries scoped to authenticated user

---

#### B7 — Ledger Module
**Repo:** `dime-api`
**Depends on:** B2

**Deliverables:**
- Prisma migrations: `LedgerPerson`, `LedgerEntry` models
- `GET /api/ledger/people` — list with net balance per person + overall summary
- `POST /api/ledger/people` — create person
- `PATCH /api/ledger/people/:id` — update
- `DELETE /api/ledger/people/:id` — cascade deletes entries
- `GET /api/ledger/people/:id/entries` — list entries, optional `?settled=true/false`
- `POST /api/ledger/people/:id/entries` — add entry
- `PATCH /api/ledger/entries/:id` — edit
- `DELETE /api/ledger/entries/:id` — delete
- `POST /api/ledger/people/:id/settle` — set settled=true + settledAt on all unsettled entries
- Net balance logic: `sum(GAVE, unsettled) - sum(RECEIVED, unsettled)`

**Acceptance criteria:**
- Net balance correctly reflects gave vs received
- Overall summary correctly aggregates across all people
- Settle marks only unsettled entries
- Settled entries still visible in history
- Cannot access another user's people or entries

---

#### B8 — CSV Module
**Repo:** `dime-api`
**Depends on:** B4

**Deliverables:**
- `GET /api/csv/export` — stream CSV response of user's transactions
  - Columns: `Date,Amount,Type,Category,Note`
  - Optional `?from` and `?to` date filters
  - `Content-Disposition: attachment; filename="dime-export-{date}.csv"`
- `POST /api/csv/import` — accept multipart CSV upload
  - Parse with `csv-parse` (Node.js)
  - Map rows to transaction schema
  - Validate each row (amount, date, category name lookup)
  - Skip rows with errors (report them)
  - Deduplicate: skip if same date + amount + categoryId already exists
  - Return `{ imported, skipped, errors[] }`
- `@fastify/multipart` plugin for file uploads

**Acceptance criteria:**
- Export CSV is valid, parseable, contains correct columns
- Import handles malformed rows gracefully (skip, don't crash)
- Import deduplication works
- Import creates transactions under authenticated user

---

### FRONTEND PHASES

---

#### F1 — Project Setup & Design System
**Repo:** `dime-web`
**Depends on:** nothing (can run in parallel with B1)

**Deliverables:**
- Initialize Next.js 16.2 with App Router + TypeScript
- Tailwind CSS v4 configuration with CSS custom property tokens
- Install and configure shadcn/ui (init, add: button, input, card, sheet, dialog, toast, skeleton, badge, dropdown-menu, avatar, separator, tabs, progress)
- Configure `next-themes` with 6 themes: `light`, `dark`, `dim`, `midnight`, `sunset`, `system`
- Define CSS variables for each theme in `globals.css`
- Install framer-motion, lucide-react, ky, zustand, @tanstack/react-query, react-hook-form, zod, papaparse
- `QueryProvider` component (wraps app with TanStack Query client)
- `ThemeProvider` component
- Root layout with providers
- `lib/api.ts` — ky instance with base URL from env, JWT interceptor (reads from Zustand), auto-refresh on 401
- `lib/utils/currency.ts` — `formatINR(amount)` using `Intl.NumberFormat('en-IN')`
- `lib/utils/date.ts` — common date helpers (startOfWeek, formatDate, etc.)
- ESLint + Prettier config

**Acceptance criteria:**
- `npm run dev` starts on port 3000
- Theme switcher changes CSS variables correctly (verify in browser)
- `formatINR(1234.5)` returns `₹1,234.50`

---

#### F2 — Auth UI
**Repo:** `dime-web`
**Depends on:** F1, B2

**Deliverables:**
- `useAuthStore` (Zustand) — `{ user, accessToken, setAuth, clearAuth }`
- `app/(auth)/login/page.tsx` — email/password form, react-hook-form + Zod validation
- `app/(auth)/signup/page.tsx` — name/email/password form
- API calls: `authApi.login()`, `authApi.signup()`
- Store access token in Zustand (in-memory), refresh token in localStorage
- `app/(app)/layout.tsx` — auth guard: redirect to `/login` if no token
- Token refresh: ky beforeError hook → if 401 → call refresh → retry
- `useCurrentUser` hook
- Logout clears store + redirects

**Acceptance criteria:**
- Login with valid credentials redirects to `/log`
- Login with bad credentials shows inline error
- Unauthenticated visit to `/log` redirects to `/login`
- After token expiry, next request transparently refreshes and retries

---

#### F3 — App Shell & Navigation
**Repo:** `dime-web`
**Depends on:** F2

**Deliverables:**
- `BottomNav` component — 5 tabs: Log, Insights, Budgets, Ledger, Settings
  - Active state highlighting
  - Icon + label per tab
  - Fixed to bottom, safe-area inset aware
- `TopBar` component — page title + optional action button (e.g. "Add")
- Shared `PageLayout` wrapper — TopBar + content + BottomNav
- Smooth tab transition (framer-motion `AnimatePresence`)
- Responsive: bottom nav on mobile, left sidebar on ≥1024px
- Each tab page renders as placeholder `<h1>` (content filled in later phases)
- 404 page

**Acceptance criteria:**
- Navigating between tabs shows correct page
- Active tab is visually highlighted
- On mobile (375px) bottom nav is visible and tappable
- Page transition animation plays on tab change

---

#### F4 — Categories Management
**Repo:** `dime-web`
**Depends on:** F3, B3

**Deliverables:**
- `useCategories` hook — TanStack Query, fetches `GET /api/categories`
- `categoriesApi.ts` — typed API calls
- `CategoryList` component — grid of emoji+name chips
- `CategoryForm` — bottom sheet with name input, emoji picker (inline grid), color picker
- Create / edit / delete with optimistic updates
- Delete shows confirmation dialog; shows error toast if category has transactions
- Accessible from Settings → Categories

**Acceptance criteria:**
- Category list shows all 18 defaults on fresh account
- Create adds optimistically, confirms with server
- Cannot delete a category with linked transactions (shows error)
- Emoji picker shows selectable emoji grid

---

#### F5 — Transaction Log
**Repo:** `dime-web`
**Depends on:** F4, B4

**Deliverables:**
- `useTransactions(filters)` hook — TanStack Query with pagination (infinite scroll)
- `transactionsApi.ts`
- `TransactionList` — grouped by date (sticky date headers), infinite scroll
- `TransactionItem` — amount (color: red expense / green income), category emoji, note, time
- Swipe-to-delete gesture (`@use-gesture/react`) with undo toast (5s to cancel)
- Tap to edit — opens `TransactionForm` bottom sheet
- `TransactionForm` — amount input (numeric keyboard), category selector, date picker, note, income toggle
- `AddTransactionFAB` — floating action button, opens form
- `SearchBar` — debounced search, filters list in-place
- Filter bar — category filter chips, income/expense toggle, date range picker
- Empty state illustration when no transactions
- Skeleton loading on initial fetch

**Acceptance criteria:**
- Transactions grouped by date, newest first
- Infinite scroll loads next page on scroll to bottom
- Search debounces 300ms, hits API with `?search=`
- Swipe left reveals delete; undo toast cancels deletion within 5s
- Adding a transaction updates list optimistically

---

#### F6 — Budgets
**Repo:** `dime-web`
**Depends on:** F4, B5

**Deliverables:**
- `useBudgets` hook — TanStack Query
- `budgetsApi.ts`
- `BudgetList` — grid layout of budget cards
- `BudgetCard` component:
  - Emoji + name
  - Category name chip
  - Period badge (Daily/Weekly/Monthly/Yearly)
  - Horizontal progress bar (color changes: green → amber → red at thresholds)
  - Spent / Limit amounts
  - Days remaining
- `BudgetDonutSummary` — donut chart at top showing overall budget health
- `BudgetForm` — bottom sheet: name, emoji, category select, period select, amount
- Edit via long press context menu; delete with confirmation
- Empty state with "Create your first budget" CTA

**Acceptance criteria:**
- Progress bar correctly reflects spent/limit
- Progress bar turns amber at 75%, red at 90%+
- Donut chart reflects aggregate across all budgets
- Creating a budget appears instantly (optimistic)

---

#### F7 — Insights: Core Charts
**Repo:** `dime-web`
**Depends on:** F5, B6

**Deliverables:**
- `useAnalytics(params)` hook — TanStack Query
- `analyticsApi.ts`
- `InsightsPage` with period tabs: Weekly / Monthly / Yearly
- `BarChart` (Recharts) — income vs expense per period bucket
  - Reference line for average
  - Tap a bar to drill into that date
- `OverviewCard` — total income, total expense, net balance for period
- `CategoryPieChart` — donut chart + ranked list below
- `CategoryFilterChips` — filter charts by category
- Income/Expense toggle — switch between views
- Period navigation arrows (prev/next week, month, year)
- Animated chart entry (framer-motion)
- Skeleton loaders while data fetches

**Acceptance criteria:**
- Weekly shows 7 bars (Mon–Sun)
- Monthly shows correct days in selected month
- Yearly shows 12 bars
- Period navigation moves forward/backward correctly
- Category pie percentages sum correctly

---

#### F8 — Insights: Advanced Analytics
**Repo:** `dime-web`
**Depends on:** F7, B6

**Deliverables:**
- `TrendsChart` — multi-month line chart (income vs expense over N months)
- `BudgetVsActualChart` — grouped bar chart: budgeted vs spent per category
- `TopSpendingDays` — ranked list with date + amount
- `AverageDailySpend` — stat card with trend arrow
- `LargestTransactions` — ranked list (top 10), tap to view transaction detail
- `SpendingVelocity` — for each active budget: on-track/over-pace indicator
- `NetCashflowChart` — area chart showing cumulative net over time
- All charts wrapped in collapsible sections on Insights page
- Date range picker for custom range analytics

**Acceptance criteria:**
- Trends chart shows correct N months of data
- Budget vs actual correctly maps budget periods to actual spend
- Date range picker constrains analytics to selected range

---

#### F9 — Ledger
**Repo:** `dime-web`
**Depends on:** F3, B7

**Deliverables:**
- `useLedgerPeople` hook + `useLedgerEntries(personId)` hook
- `ledgerApi.ts`
- `LedgerPage` — list of people cards
  - `SummaryBanner` — "You are owed ₹X" + "You owe ₹Y"
  - `PersonCard` — name, color avatar, net balance chip (green/red/gray)
  - Add person FAB
- `PersonDetailPage` (`/ledger/[personId]`) —
  - Person header with net balance + settle-up button
  - Entry list (chronological), grouped by settled/active
  - `EntryItem` — type icon (gave/received), amount, date, note, settled badge
  - Swipe to delete entry
  - Tap to edit entry
  - `AddEntryFAB` → `EntryForm` bottom sheet: type toggle, amount, date, note
- `SettleUpDialog` — confirm settling, shows total being settled
- `PersonForm` — bottom sheet: name, phone (optional), note (optional), color picker

**Acceptance criteria:**
- Net balance correctly shows positive (they owe) vs negative (you owe)
- Summary banner totals match across all people
- Settle up marks all active entries and updates balance to ₹0
- Settled entries remain visible with settled badge
- Empty person has ₹0 balance and "All settled" state

---

#### F10 — Settings
**Repo:** `dime-web`
**Depends on:** F4, B8, F1

**Deliverables:**
- `SettingsPage` with sections:
  - **Appearance** — theme selector (6 themes, visual previews)
  - **Account** — name edit, email display, change password form, delete account (with confirmation)
  - **Categories** — link to category management (F4)
  - **Data**:
    - Export CSV button → `GET /api/csv/export` → triggers file download
    - Import CSV button → file picker → upload → preview modal (shows count + errors) → confirm
- `ThemeSelector` — grid of theme preview swatches, persists to DB on change
- Import preview modal: "X transactions will be imported, Y skipped, Z errors"
- Account deletion: two-step confirmation (type "DELETE"), then clears session

**Acceptance criteria:**
- Selecting a theme applies immediately and persists across reload
- CSV export downloads a valid file
- CSV import shows preview before committing
- Deleting account logs out and clears all data

---

#### F11 — PWA & Polish
**Repo:** `dime-web`
**Depends on:** all F phases

**Deliverables:**
- `public/manifest.json` with name, icons, theme_color, display: standalone
- App icons: 192×192, 512×512, 512×512 maskable (PNG)
- `next-pwa` configuration — cache-first for static assets
- Service worker registered in production
- `<meta name="theme-color">` in layout
- `<meta name="apple-mobile-web-app-capable">` for iOS
- Loading states audit — every data fetch has a skeleton
- Error boundary components — graceful error UI
- Empty state components for all list views
- Toast system audit — all mutations show success/error toasts
- Mobile UX audit: touch targets, safe-area insets, scroll behavior
- `robots.txt`, `sitemap.xml` (just home page, app is private)
- Lighthouse PWA score target: ≥90

**Acceptance criteria:**
- Chrome on Android shows "Add to Home Screen" prompt
- iOS Safari "Add to Home Screen" shows correct icon + name
- App loads with correct icon and splash when opened from home screen
- Lighthouse PWA audit passes installability checks

---

## 9. Phase Dependency Map

```
BACKEND                              FRONTEND
───────────────────────────────────────────────────────────────

B1 (Setup)                           F1 (Setup + Design System)
  │                                    │
  ▼                                    ▼
B2 (Auth)  ──────────────────────── F2 (Auth UI)
  │                                    │
  ├──── B3 (Categories) ─────────── F3 (App Shell)
  │         │                          │
  │         ▼                          ▼
  │      B4 (Transactions) ───────── F4 (Categories)
  │         │                          │
  │         ├── B5 (Budgets) ──────── F5 (Transaction Log)
  │         │       │                  │
  │         │       ▼                  ▼
  │         │   B6 (Analytics) ───── F6 (Budgets)
  │         │                          │
  │         └── B8 (CSV) ──────────── F7 (Insights Core)
  │                                    │
  └──── B7 (Ledger) ───────────────── F8 (Insights Advanced)
                                       │
                                    F9 (Ledger)
                                       │
                                    F10 (Settings)
                                       │
                                    F11 (PWA + Polish)
```

### Parallel work possible from Day 1
- `B1` and `F1` can start simultaneously (no dependency between them)
- `B7` (Ledger backend) can start as soon as `B2` is done — independent of B3–B6
- `F9` (Ledger frontend) only needs `F3` + `B7`

---

## 10. Environment Variables

### dime-api (.env)
```env
# Server
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/dime_dev"

# JWT
JWT_ACCESS_SECRET="your-access-secret-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-min-32-chars"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="30d"

# CORS
CORS_ORIGIN="http://localhost:3000"
```

### dime-web (.env.local)
```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

---

## 11. Conventions & Standards

### API Response Format
```json
// Success (single resource)
{ "data": { ... } }

// Success (list)
{ "data": [...], "meta": { "total": 100, "page": 1, "limit": 20 } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

### HTTP Status Codes
| Status | When |
|---|---|
| 200 | Successful GET / PATCH |
| 201 | Successful POST (created) |
| 204 | Successful DELETE |
| 400 | Validation error (Zod) |
| 401 | Missing or invalid token |
| 403 | Valid token but wrong ownership |
| 404 | Resource not found |
| 409 | Conflict (duplicate, can't delete) |
| 500 | Unexpected server error |

### Naming Conventions
- **Backend**: camelCase variables, PascalCase types/classes, kebab-case files
- **Frontend**: PascalCase components, camelCase hooks (`useTransactions`), kebab-case route segments
- **Database**: camelCase fields in Prisma, snake_case in raw SQL
- **API routes**: kebab-case (`/ledger-persons` → `/ledger/people`)

### Git Branch Strategy (per repo)
```
main          → production-ready code
dev           → integration branch
feature/B1-setup
feature/F5-transaction-log
```

### Commit Message Format
```
type(scope): short description

feat(auth): add refresh token rotation
fix(budgets): correct weekly period boundary
chore(deps): upgrade prisma to 6.1
```
