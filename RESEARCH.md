# Dime Web — Research & Architecture Reference

> **Source app**: [rafsoh/dimeApp](https://github.com/rafsoh/dimeApp) — iOS-only expense tracker
> **Goal**: Rebuild as a cross-platform PWA (web + installable on Android/iOS)
> **Status**: Research complete — awaiting implementation green light

---

## 1. iOS App Feature Inventory

### Core Features

| Feature | Description |
|---|---|
| Transaction logging | Add expense/income with amount, date, category, notes |
| Recurring transactions | Repeating entries with customizable intervals |
| Categories | Predefined + custom categories with emoji identifiers |
| Budget management | Per-category budgets with daily/weekly/monthly/yearly timeframes |
| Analytics / Insights | Weekly, monthly, yearly charts; net income; period-over-period % change; category breakdowns |
| Multi-device sync | Automatic iCloud sync via CloudKit |
| Biometric security | Face ID / Touch ID app lock |
| CSV import/export | Data portability |
| Widgets | Home screen & lock screen widgets |
| Siri Shortcuts | App Intents for voice commands |
| Dark mode | Light/Dark/System theme |
| 179 currencies | Locale-specific names and symbols |
| Notifications | Morning/Evening/Custom reminders |
| Haptics | None/Subtle/Excessive |
| Confetti animations | Positive reinforcement feedback |

### Screens / Navigation (5 tabs — web version)

1. **Log** — Transaction history, search, edit/delete with undo toast
2. **Insights** — Charts (bar, pie/donut), filters by category/date/income-expense toggle
3. **Budget** — Per-category budget cards with donut progress
4. **Ledger** — People money tracking (gave / received / net balance) ← new
5. **Settings** — General, Appearance, Data, Behaviour

### Data Models

```
Transaction
  - amount: Double
  - date: Date
  - note: String
  - category: → Category
  - isIncome: Bool
  - isRecurring: Bool
  - nextTransactionDate: Date (computed)

Category
  - name: String
  - emoji: String
  - transactions: [Transaction]

Budget
  - name: String
  - colour: String
  - emoji: String
  - type: Enum (Daily | Weekly | Monthly | Yearly)
  - amount: Double
  - endDate: Date (computed)
  - category: → Category

TemplateTransaction
  - Quick-add shortcuts stored as templates
```

### Predefined Categories

**Expenses (12):** Food, Transport, Rent, Shopping, Entertainment, Healthcare, Utilities, Subscriptions, Education, Travel, Personal Care, Gifts

**Incomes (6):** Salary, Freelance, Allowance, Investments, Rental Income, Other

### iOS Libraries → Web Equivalents

| iOS Library | Purpose | Web Equivalent |
|---|---|---|
| SwiftUI | UI framework | Next.js + shadcn/ui |
| Core Data + CloudKit | Local DB + sync | Prisma + PostgreSQL |
| ConfettiSwiftUI | Confetti effects | canvas-confetti (V2) |
| Alamofire | Networking | fetch / TanStack Query |
| WidgetKit | Home screen widgets | Not possible in PWA |
| AppIntents | Siri Shortcuts | Not possible in PWA |
| LocalAuthentication | Biometrics | WebAuthn (V2) |
| UserNotifications | Push notifications | Web Push API (V2) |

---

## 2. Final Tech Stack (V1)

```
Layer               Technology
─────────────────────────────────────────────────────
Framework           Next.js 16.2 (App Router) + TypeScript
Styling             Tailwind CSS v4
UI Components       shadcn/ui (Radix UI primitives)
Animations          framer-motion
Charts              Recharts (bar, line, pie, donut)
Icons               lucide-react
Server State        TanStack Query v5
Client State        Zustand v5
ORM                 Prisma
Database            PostgreSQL (local dev → self-hosted prod)
Auth                Auth.js (NextAuth v5) + Prisma adapter
PWA                 Web App Manifest + basic Service Worker
Theming             next-themes + CSS variables (multi-theme)
CSV                 papaparse (import + export)
Currency            INR only (Intl.NumberFormat)
Hosting             Vercel (dev/MVP) → self-hosted AWS/VPS (prod)
```

### Out of scope for V1

- Offline support / sync queue
- Biometric lock
- Push notifications
- Confetti animations
- Multi-currency
- Recurring transactions
- Widgets / Siri Shortcuts (not possible on web)

---

## 3. Architectural Decisions (Confirmed)

| Decision | Choice | Notes |
|---|---|---|
| Auth | **Account required** | Login required to use the app. No local-only mode. |
| Backend DB | **PostgreSQL (self-hosted)** | Local Postgres for dev → AWS RDS / VPS for prod |
| Sync layer | **Direct Postgres via Next.js API** | No managed sync service. TanStack Query for caching + optimistic updates. |
| ORM | **Prisma** | Type-safe, great migrations, first-class Next.js support |
| Auth system | **Auth.js (NextAuth v5)** | Email/password + OAuth, Prisma adapter |
| Offline | **None for V1** | Simple network-first, no local queue |
| Currency | **INR only** | Single currency, `Intl.NumberFormat('en-IN')` |
| Analytics | **Advanced** | See section 6 |

### Backend Architecture

```
Next.js 16.2 (App Router)
  └── Route Handlers (/api/*)
        └── Prisma ORM
              └── PostgreSQL
                    dev:  local (Docker or native install)
                    prod: self-hosted (AWS RDS / VPS)

Auth: Auth.js v5 with Prisma adapter
State: TanStack Query v5 (server) + Zustand v5 (UI)
```

---

## 4. Database Schema (Prisma)

```prisma
model User {
  id           String        @id @default(cuid())
  email        String        @unique
  name         String?
  password     String?       // hashed, null if OAuth
  createdAt    DateTime      @default(now())
  transactions Transaction[]
  categories   Category[]
  budgets      Budget[]
  templates    Template[]
}

model Transaction {
  id         String   @id @default(cuid())
  amount     Float
  date       DateTime
  note       String?
  isIncome   Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  userId     String
  categoryId String
  user       User     @relation(fields: [userId], references: [id])
  category   Category @relation(fields: [categoryId], references: [id])
}

model Category {
  id           String        @id @default(cuid())
  name         String
  emoji        String
  color        String?
  isDefault    Boolean       @default(false)
  userId       String
  user         User          @relation(fields: [userId], references: [id])
  transactions Transaction[]
  budgets      Budget[]
}

model Budget {
  id         String     @id @default(cuid())
  name       String
  emoji      String
  colour     String
  type       BudgetType // DAILY | WEEKLY | MONTHLY | YEARLY
  amount     Float
  startDate  DateTime
  userId     String
  categoryId String
  user       User       @relation(fields: [userId], references: [id])
  category   Category   @relation(fields: [categoryId], references: [id])
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model Template {
  id         String  @id @default(cuid())
  amount     Float?
  note       String?
  isIncome   Boolean @default(false)
  userId     String
  categoryId String?
  user       User    @relation(fields: [userId], references: [id])
}

enum BudgetType {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}
```

---

## 5. Ledger — People & Money Tracking (New Feature)

A standalone section of the app for tracking money you've lent to or borrowed from people. Fully separate from expense tracking.

### Concept

```
Person (contact in your ledger)
  └── LedgerEntry[]
        ├── GAVE    → you gave them money (they owe you)
        └── RECEIVED → you received money from them (you owe them)

Per person summary:
  totalGave      = sum of all GAVE entries (active)
  totalReceived  = sum of all RECEIVED entries (active)
  netBalance     = totalGave - totalReceived
                   positive → they owe you
                   negative → you owe them
```

### Screens

**Ledger tab (top level)**
- List of all people with their net balance chip (green = owed to you, red = you owe)
- Total summary card at top: "You are owed ₹X" / "You owe ₹Y"
- Tap a person → detail view
- FAB to add new person

**Person Detail Screen**
- Person name, optional phone/note
- Net balance summary at top
- Chronological list of all entries (gave / received) with date, amount, note
- Each entry: swipe to delete, tap to edit
- "Add Entry" button — bottom sheet with: type (Gave/Received), amount, date, note
- "Mark as Settled" button — settles all active entries, keeps history

### Data Models (Prisma additions)

```prisma
model LedgerPerson {
  id        String         @id @default(cuid())
  name      String
  phone     String?
  note      String?
  color     String?        // UI accent color
  userId    String
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries   LedgerEntry[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
}

model LedgerEntry {
  id        String          @id @default(cuid())
  amount    Float
  type      LedgerEntryType // GAVE | RECEIVED
  date      DateTime
  note      String?
  settled   Boolean         @default(false)
  settledAt DateTime?
  personId  String
  userId    String
  person    LedgerPerson    @relation(fields: [personId], references: [id], onDelete: Cascade)
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
}

enum LedgerEntryType {
  GAVE      // you gave money → they owe you
  RECEIVED  // you received money → you owe them
}
```

### Updated User model (add relations)
```prisma
// Add to existing User model:
ledgerPersons LedgerPerson[]
ledgerEntries LedgerEntry[]
```

### API Routes
```
GET    /api/ledger/people              → list all people with net balance
POST   /api/ledger/people              → create person
PATCH  /api/ledger/people/[id]         → update person
DELETE /api/ledger/people/[id]         → delete person + all entries

GET    /api/ledger/people/[id]/entries → list entries for a person
POST   /api/ledger/people/[id]/entries → add entry
PATCH  /api/ledger/entries/[id]        → edit entry
DELETE /api/ledger/entries/[id]        → delete entry
POST   /api/ledger/people/[id]/settle  → mark all active entries as settled
```

### Summary Logic
```
Overall summary (Ledger tab header):
  youAreOwed = sum(entries where type=GAVE and settled=false) across all people
  youOwe     = sum(entries where type=RECEIVED and settled=false) across all people

Per person:
  netBalance = sum(GAVE, unsettled) - sum(RECEIVED, unsettled)
  status     = netBalance > 0 → "owes you" | < 0 → "you owe" | 0 → "settled"
```

---

## 6. Feature Parity Map (iOS → Web V1)

| iOS Feature | Web V1 | Notes |
|---|---|---|
| Transaction CRUD | ✅ | Core feature |
| Income tracking toggle | ✅ | isIncome flag |
| Categories (predefined + custom) | ✅ | Seed defaults on signup |
| Budget tracking | ✅ | Recharts donut progress |
| Insights — weekly/monthly/yearly | ✅ | Recharts bar charts |
| Category filter on charts | ✅ | Zustand filter state |
| Dark mode | ✅ | next-themes + Tailwind |
| Search transactions | ✅ | DB query filter |
| CSV export | ✅ | papaparse + Blob download |
| CSV import | ✅ | FileReader API + papaparse |
| Edit / delete with undo toast | ✅ | Optimistic update + toast |
| Settings page | ✅ | Theme, account management |
| CSV import/export | ✅ | FileReader API + papaparse |
| Multi-theme | ✅ | next-themes + CSS variables |
| **Ledger — add/edit/remove people** | ✅ | New web-only feature |
| **Ledger — gave / received entries** | ✅ | Per-person entry list |
| **Ledger — net balance summary** | ✅ | Per person + overall |
| **Ledger — settle up** | ✅ | Mark entries as settled |
| Recurring transactions | V2 | |
| Biometric lock | V2 | WebAuthn |
| Push notifications | V2 | Web Push |
| Haptics | V2 | Vibration API (Android) |
| Home screen widget | N/A | Not possible on web |
| Siri Shortcuts | N/A | Not possible on web |

---

## 6. Advanced Analytics Scope

Beyond iOS parity (weekly/monthly/yearly), the web app will add:

| Chart / View | Description |
|---|---|
| Category breakdown | Pie chart + ranked list with % of total spend |
| Trend analysis | Month-over-month spend per category (line chart) |
| Budget vs actual | Bar chart: budgeted vs spent per category |
| Top spending days | Ranked list or heatmap of highest-spend days |
| Average daily/weekly spend | Rolling average overlay on bar chart |
| Income vs expense balance | Net cashflow over time (area chart) |
| Largest transactions | Ranked list with date + category filter |
| Spending velocity | Progress indicator — on track to hit budget? |

---

## 7. Project Structure

```
dime-web/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (app)/
│   │   ├── layout.tsx          ← bottom nav, auth guard
│   │   ├── log/                ← transaction history
│   │   ├── insights/           ← charts & analytics
│   │   ├── budgets/            ← budget tracking
│   │   ├── ledger/             ← people money tracking
│   │   │   └── [personId]/     ← individual person detail
│   │   └── settings/           ← app settings
│   ├── api/
│   │   ├── auth/[...nextauth]/ ← Auth.js handler
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── budgets/
│   │   └── ledger/
│   │       ├── people/
│   │       │   ├── route.ts          ← GET list, POST create
│   │       │   └── [id]/
│   │       │       ├── route.ts      ← PATCH, DELETE
│   │       │       ├── entries/      ← GET, POST entries
│   │       │       └── settle/       ← POST settle all
│   │       └── entries/[id]/         ← PATCH, DELETE single entry
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                     ← shadcn/ui components
│   ├── transactions/           ← TransactionList, TransactionForm, etc.
│   ├── budgets/                ← BudgetCard, BudgetDonut, etc.
│   ├── ledger/                 ← PersonCard, EntryList, EntryForm, BalanceChip, etc.
│   ├── charts/                 ← BarChart, PieChart, InsightsView, etc.
│   └── shared/                 ← BottomSheet, Toast, Skeleton, etc.
├── lib/
│   ├── prisma.ts               ← Prisma client singleton
│   ├── auth.ts                 ← Auth.js config
│   └── utils/                  ← currency.ts, date.ts, etc.
├── store/
│   ├── useUIStore.ts           ← filters, active tab, modals
│   └── useTransactionStore.ts  ← optimistic updates
├── hooks/                      ← useTransactions, useBudgets, etc.
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                 ← default categories
└── public/
    ├── manifest.json
    └── icons/                  ← 192px, 512px, maskable
```

---

## 8. Key Design Principles

1. **Mobile-first**: Design for 375px screens, scale up to desktop
2. **Touch targets**: Minimum 44×44px for all interactive elements
3. **Optimistic UI**: Mutations update UI instantly, revert on error
4. **Skeleton loading**: No raw spinners — skeleton screens everywhere
5. **Bottom sheet pattern**: iOS-style bottom drawers for forms/modals
6. **Swipe gestures**: Swipe-to-delete on transaction list items
7. **Currency formatting**: `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
8. **Numeric keyboard**: `inputMode="decimal"` on all amount inputs
9. **Theme**: Clean, minimal — soft card backgrounds, per-category accent colors
10. **Smooth transitions**: framer-motion page transitions + micro-interactions

---

## 9. PWA Setup

```json
// public/manifest.json
{
  "name": "Dime — Expense Tracker",
  "short_name": "Dime",
  "display": "standalone",
  "start_url": "/",
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- **Android**: Auto install prompt after engagement (Chrome)
- **iOS 16.4+**: Share → Add to Home Screen (manual)
- Service Worker: cache-first for static assets only (V1)

---

## 10. Multi-Theme System

Using **next-themes** + Tailwind CSS variables. Each theme is a named CSS variable set applied at the `[data-theme]` root level.

### Planned Themes
| Theme | Description |
|---|---|
| **System** | Follows OS light/dark preference |
| **Light** | Clean white, soft grays |
| **Dark** | True dark background |
| **Dim** | Dark but softer (dark gray, not black) |
| **Midnight** | Deep navy blue tones |
| **Sunset** | Warm orange/amber accents |

### Implementation approach
- CSS custom properties (`--background`, `--foreground`, `--accent`, etc.) defined per theme
- `data-theme="midnight"` on `<html>` element, switched via `next-themes`
- Tailwind configured to use `var(--color-*)` tokens
- Theme stored in user settings (persisted to DB, syncs across devices)

---

## 11. CSV Import / Export

### Export
- Generates a CSV with columns: `Date, Amount, Type (Income/Expense), Category, Note`
- Triggered from Settings → Data → Export
- Uses `papaparse` to serialize, triggers browser download via `Blob` + `URL.createObjectURL`

### Import
- Accepts CSV from other apps (Dime iOS, or generic format)
- `FileReader` API reads file client-side
- `papaparse` parses rows, maps to transaction schema
- Preview shown before confirming import (count, date range, errors)
- Duplicate detection: skip rows where date + amount + category already exist

### CSV Format
```
Date,Amount,Type,Category,Note
2026-03-01,450.00,Expense,Food,Lunch at office
2026-03-02,50000.00,Income,Salary,March salary
```

---

## 12. Environment Variables Needed

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dime"

# Auth.js
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# OAuth (optional)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```
