# Dime Web — Feature Progress

> Last updated: 2026-04-05
> Legend: `[ ]` Not Started · `[~]` In Progress · `[x]` Complete

---

## F01 — Authentication (Email + Google OAuth)
**Status:** `[ ] Not Started`
**Repos:** dime-api (B2) + dime-web (F2)

### Description
Users must log in to use the app. Supports email/password registration/login and Google OAuth for one-tap sign-in. No local-only mode — an account is required.

### How It Works
User lands on `/login`. They enter email + password, or click "Continue with Google". On success the backend issues a JWT access token (15 min lifetime) and a refresh token (30 days). The access token is held in Zustand (in-memory), the refresh token in localStorage. Every API call attaches the Bearer token. On a 401 response the `ky` interceptor silently calls `/api/auth/refresh`, updates the access token, and retries the original request.

### How It's Developed

**Backend:**
- `POST /api/auth/register` — hash password (bcryptjs), create `User`, auto-seed 18 default categories, issue access + refresh tokens
- `POST /api/auth/login` — verify password, issue tokens
- `POST /api/auth/refresh` — validate `RefreshToken` in DB, rotate and reissue
- `POST /api/auth/logout` — delete refresh token from DB
- `GET /api/auth/me` — return current user profile (id, name, email, theme)
- `PATCH /api/auth/me` — update name or theme
- `PATCH /api/auth/me/password` — verify old password, hash and store new
- `DELETE /api/auth/me` — delete account; cascades all user data
- Google OAuth: exchange Google OAuth token → find or create user → issue JWT tokens
- `authenticate` preHandler hook — verify JWT on every protected route, attach `req.user`
- DB models: `User`, `RefreshToken`

**Frontend:**
- `useAuthStore` (Zustand) — `{ user, accessToken, setAuth, clearAuth }`
- `/login` page — react-hook-form + Zod validation, email + password fields, Google OAuth button
- `/signup` page — name + email + password form
- `lib/api.ts` — `ky` instance; `beforeRequest` hook attaches Bearer token; `beforeError` hook on 401: call refresh → update store → retry
- Auth guard in `app/(app)/layout.tsx` — redirect to `/login` if no `accessToken` in store
- `useCurrentUser` hook — reads from store + GET /api/auth/me on mount

### Validation (Definition of Done)
- [ ] Register creates user and seeds exactly 18 default categories
- [ ] Login with wrong credentials shows inline error, does not redirect
- [ ] Valid login redirects to `/log`
- [ ] Unauthenticated visit to `/log` redirects to `/login`
- [ ] Token expiry → silent refresh + original request retries (no visible error)
- [ ] Google OAuth creates account on first use, logs in on subsequent visits
- [ ] Logout clears Zustand store + localStorage, redirects to `/login`

---

## F02 — App Shell & Navigation
**Status:** `[ ] Not Started`
**Repos:** dime-web (F3)

### Description
The persistent chrome of the app — a 5-tab bottom navigation bar, page layout wrapper, and smooth animated tab transitions. Responsive: bottom nav on mobile, left sidebar on desktop.

### How It Works
After login, the user always sees the bottom nav with 5 tabs: Log, Insights, Budgets, Ledger, Settings. The active tab is highlighted with the accent color. Switching tabs triggers a framer-motion slide/fade transition. On screens ≥1024px the bottom nav is hidden and replaced by a left sidebar. Each page has a `TopBar` with the page title and an optional right-side action slot (e.g. "Add" button).

### How It's Developed
- `BottomNav` component — 5 items, each with a lucide icon + text label. Uses `usePathname()` to determine the active tab. Fixed to bottom with `padding-bottom: env(safe-area-inset-bottom)` for iOS home indicator clearance.
- `PageLayout` — wraps all `(app)/*` pages: `TopBar` + scrollable content area + `BottomNav`
- framer-motion `AnimatePresence` on the route segment, slide direction based on tab index
- Responsive: `lg:hidden` on `BottomNav`, `lg:flex lg:flex-col` on a `Sidebar` component
- 404 page with a "Go home" link

### Validation (Definition of Done)
- [ ] 5 tabs visible and tappable on 375px viewport
- [ ] Active tab is visually distinct (icon + label highlighted)
- [ ] Tab switch animation plays (no white flash)
- [ ] Left sidebar replaces bottom nav at ≥1024px
- [ ] TopBar shows the correct page title on every route
- [ ] 404 page renders for unknown routes

---

## F03 — Multi-Theme System
**Status:** `[ ] Not Started`
**Repos:** dime-api (B2 — `theme` on User) + dime-web (F1)

### Description
6 visual themes: Light, Dark, Dim, Midnight, Sunset, System. The chosen theme is saved to the DB and syncs across all devices/sessions for that user.

### How It Works
In Settings → Appearance the user sees a grid of 6 theme preview swatches. Clicking one applies it immediately (no page reload) and saves it to the server. On next login from any device `GET /api/auth/me` returns the stored `theme` and `next-themes` applies it before first paint — no flash.

### How It's Developed
- CSS custom properties for every theme defined in `app/globals.css`: `--background`, `--foreground`, `--card`, `--card-foreground`, `--accent`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--primary`, `--primary-foreground`, `--destructive`
- Each theme applied via `[data-theme="midnight"] { --background: ... }` etc.
- `ThemeProvider` (next-themes) wraps root layout; `attribute="data-theme"`
- `ThemeSelector` component: 6 swatches showing a mini color preview. On click → `setTheme(value)` + `PATCH /api/auth/me { theme }`.
- On app boot: read `user.theme` from `useCurrentUser` → call `setTheme`
- Tailwind: `bg-[var(--background)]`, `text-[var(--foreground)]` etc. as base tokens

### Validation (Definition of Done)
- [ ] Selecting any of 6 themes changes appearance immediately
- [ ] Theme persists across browser hard reload (stored in cookie by next-themes)
- [ ] Logging in on a second device reflects the same theme
- [ ] System theme correctly tracks OS dark/light preference

---

## F04 — Categories
**Status:** `[ ] Not Started`
**Repos:** dime-api (B3) + dime-web (F4)

### Description
Emoji-tagged categories used to classify every transaction and budget. 18 default categories are seeded automatically on registration. Users can create custom categories and edit or delete them.

### How It Works
On registration 18 defaults are created (12 expense: Food, Transport, Rent, Shopping, Entertainment, Healthcare, Utilities, Subscriptions, Education, Travel, Personal Care, Gifts; 6 income: Salary, Freelance, Allowance, Investments, Rental Income, Other). In Settings → Categories the user sees a grid of emoji + name chips. Tapping "+" opens a bottom sheet to create a custom category — pick a name, choose an emoji from a grid, and pick a color from preset swatches. Tapping an existing chip opens the same form pre-filled for editing. Long-press or a delete icon on the chip opens a confirmation; if the category has linked transactions the server returns 409 and an error toast is shown instead.

### How It's Developed
- `useCategories` hook — `useQuery` fetching `GET /api/categories`, cached with `staleTime: 5m`
- `categoriesApi.ts` — typed wrappers for list, create, update, delete
- `CategoryList` — responsive grid of `CategoryChip` items
- `CategoryChip` — emoji + name + edit icon; long-press triggers delete confirm
- `CategoryForm` — shadcn `Sheet`; name `Input`; emoji picker (8-column grid of ~80 common emoji); color picker (10 preset swatches)
- Optimistic create/update/delete via `useMutation` + `onMutate` / `onError` rollback
- Delete: `AlertDialog` confirm → on 409 from server show `toast({ variant: "destructive" })`
- DB constraint: `@@unique([userId, name])` — duplicate name returns 400

### Validation (Definition of Done)
- [ ] Fresh account has exactly 18 categories in the list
- [ ] Creating a category with a name already used shows a validation error
- [ ] Edit updates emoji/name/color immediately (optimistic), confirmed by server
- [ ] Deleting a category that has linked transactions shows "Category in use" toast and does not delete
- [ ] Deleting an unused category removes it from the list immediately

---

## F05 — Transaction Log
**Status:** `[ ] Not Started`
**Repos:** dime-api (B4) + dime-web (F5)

### Description
The core feature of the app. Browse, search, filter, add, edit, and delete income and expense transactions. Transactions are grouped by date with infinite scroll.

### How It Works
`/log` shows a feed of transactions grouped by date (sticky date headers, newest first). A floating "+" button opens an add form (bottom sheet): amount with numeric keyboard, category picker, date picker, note text field, income/expense toggle. Swiping a transaction item left reveals a delete action — deletion is optimistic with a 5-second undo toast. Tapping an item opens the same form pre-filled for editing. A search bar debounces 300ms and filters results by note text. A filter bar allows narrowing by category chip, income/expense toggle, and date range.

### How It's Developed
- `useTransactions(filters)` — `useInfiniteQuery`, `GET /api/transactions`, page size 20
- `TransactionList` — date-grouped sections; `IntersectionObserver` at bottom → `fetchNextPage`
- `TransactionItem` — category emoji left, note + time center, amount right (green income / red expense)
- `@use-gesture/react` `useDrag` for swipe-to-delete; threshold 80px; spring-back if released early
- Undo: `useRef(timer)` delays the `DELETE` call by 5000ms; toast "Cancel" clears timer and restores item
- `TransactionForm` — shadcn `Sheet`; `react-hook-form` + Zod; `inputMode="decimal"` on amount; category selector opens a mini-sheet; `shadcn Calendar` for date
- `AddTransactionFAB` — fixed bottom-right; hides on scroll down, shows on scroll up via `useScroll` + framer-motion `y` spring
- `SearchBar` — controlled input + `useDebouncedValue(300)` → updates `filters.search` in Zustand → triggers query refetch
- Filter bar — horizontally scrollable chip row; active filters highlighted
- Skeleton: `TransactionItemSkeleton` × 8 on initial load

### Validation (Definition of Done)
- [ ] Transactions grouped by date, newest first
- [ ] Infinite scroll loads next page when scrolled to bottom
- [ ] Search filters case-insensitively with 300ms debounce
- [ ] Swipe left reveals delete; undo toast cancels deletion within 5 seconds
- [ ] Adding a transaction updates the list immediately (optimistic), confirmed by server
- [ ] Category, income/expense, and date filters all work in combination
- [ ] Empty state illustration shown when no transactions match the current filters
- [ ] Skeleton shown on initial load before data arrives

---

## F06 — Quick-Add Templates
**Status:** `[ ] Not Started`
**Repos:** dime-api (Template CRUD endpoints) + dime-web (F5 extension)

### Description
Saved shortcuts for frequently logged transactions. Appear as tappable chips inside the transaction form for instant pre-fill.

### How It Works
Inside the add/edit transaction bottom sheet, a horizontal scrollable row of template chips appears above the form fields (e.g., "☕ Coffee ₹80", "🚌 Bus ₹25"). Tapping one pre-fills the form (amount, category, note) instantly. Users can create, rename, and delete templates from Settings → Templates, or save the current form as a template via a "Save as template" button inside the form.

### How It's Developed
- `useTemplates` hook — `useQuery` fetching `GET /api/templates`
- Template chips: horizontally scrollable flex row; each chip shows emoji + label + amount
- Tap chip → `form.reset({ amount: t.amount, categoryId: t.categoryId, note: t.note, isIncome: t.isIncome })`
- Settings → Templates: full CRUD list with `TemplateForm` bottom sheet
- "Save as template" inside `TransactionForm`: opens a popover asking for a label → `POST /api/templates`

### Validation (Definition of Done)
- [ ] Template chips appear in the transaction form
- [ ] Tapping a template pre-fills all applicable form fields correctly
- [ ] Creating a template from the form works
- [ ] CRUD from Settings → Templates works (create, rename label, delete)

---

## F07 — Budgets
**Status:** `[ ] Not Started`
**Repos:** dime-api (B5) + dime-web (F6)

### Description
Per-category spending limits with configurable time periods (Daily, Weekly, Monthly, Yearly). Tracks actual spend in real time and visualises progress.

### How It Works
`/budgets` shows a grid of budget cards at the top is a donut chart summarising aggregate budget health. Each card displays the emoji, budget name, category chip, period badge, a color-coded horizontal progress bar, and spent/limit amounts with days remaining. Tapping "+" opens a form: name, emoji, category (dropdown), period (segmented select), and limit amount. Long-pressing a card opens a context menu with Edit and Delete options.

### How It's Developed
- `useBudgets` — `useQuery` fetching `GET /api/budgets`; response includes computed `spent` and `percent` per budget
- Backend period boundary logic: DAILY = today midnight→midnight; WEEKLY = current Mon 00:00 → Sun 23:59; MONTHLY = 1st of month → last day; YEARLY = Jan 1 → Dec 31
- `BudgetCard` — progress bar: `width: clamp(0, percent, 100)%`; color class: `<75% → green`, `75–90% → amber`, `>90% → red`
- `BudgetDonutSummary` — Recharts `PieChart`: two segments (total spent vs total remaining across all budgets)
- `BudgetForm` — shadcn `Sheet`; category `Select`; period `RadioGroup`; amount `Input`
- Long-press: `useRef(timer)` starts on `pointerdown`, cancels on `pointerup` < 500ms; shows `DropdownMenu`

### Validation (Definition of Done)
- [ ] Progress bar color changes correctly at 75% and 90%
- [ ] Spent correctly reflects only transactions within the active period boundaries
- [ ] DAILY budget shows only today's transactions; WEEKLY resets on Monday
- [ ] Donut chart reflects aggregate health across all budgets
- [ ] Creating a budget appears in the list instantly (optimistic)
- [ ] `GET /api/budgets/:id/progress` returns correct `{ spent, remaining, percent, daysRemaining }`

---

## F08 — Insights: Core Charts
**Status:** `[ ] Not Started`
**Repos:** dime-api (B6) + dime-web (F7)

### Description
Visual overview of income vs expense with period tabs (Weekly / Monthly / Yearly), a bar chart per time bucket, and a category breakdown donut.

### How It Works
`/insights` has three tabs at the top. The selected period shows: an overview card (total income, total expense, net balance), a bar chart with one pair of bars (income/expense) per time bucket (7 for weekly, N days for monthly, 12 for yearly), and below it a donut chart showing category breakdown. Arrow buttons navigate to the previous/next period. Category filter chips narrow the charts to a single category. An income/expense toggle switches the category donut between income and expense views. Tapping a bar drills into that date's transactions.

### How It's Developed
- `useAnalyticsOverview({ from, to })` — `GET /api/analytics/overview`
- `useAnalyticsByPeriod({ period, date })` — `GET /api/analytics/by-period`
- `useAnalyticsByCategory({ from, to, isIncome })` — `GET /api/analytics/by-category`
- Recharts `BarChart` with `ResponsiveContainer`; two `Bar` per `XAxis` tick (income = green, expense = red/pink); `ReferenceLine` at computed average
- Period navigation: `currentDate` in local state; arrows call `addWeeks / subWeeks` etc.
- Animated chart entry: framer-motion `motion.div` with `initial={{ opacity:0, y:20 }}` on mount
- Skeleton: two grey rectangle placeholders during fetch

### Validation (Definition of Done)
- [ ] Weekly tab shows exactly 7 bars (Mon through Sun)
- [ ] Monthly tab shows the correct number of days for the selected month
- [ ] Yearly tab shows exactly 12 bars
- [ ] Period navigation arrows move forward/backward correctly
- [ ] Category filter updates both the bar chart and the donut
- [ ] Category donut percentages sum to ~100%
- [ ] Skeleton shown while data is loading

---

## F09 — Insights: Advanced Analytics
**Status:** `[ ] Not Started`
**Repos:** dime-api (B6 — 3 additional endpoints) + dime-web (F8)

### Description
Deeper analytics below the core charts: multi-month trend line, budget vs actual grouped bars, top spending days list, net cashflow area chart, and spending velocity indicators.

### How It Works
Below the core charts, collapsible sections reveal additional analytics. Each section can be expanded/collapsed independently. A custom date range picker at the top of the page overrides the period tabs to constrain all analytics to a specific date window.

### How It's Developed
- `useTrends({ months })` — `GET /api/analytics/trends?months=6`
- `useTopDays({ from, to, limit })` — `GET /api/analytics/top-days`
- `useBudgetVsActual()` — `GET /api/analytics/budget-vs-actual`
- Recharts `LineChart` (two lines: income + expense over months)
- Recharts `BarChart` grouped (two bars per category: budgeted vs actual)
- Recharts `AreaChart` (cumulative net cashflow)
- Collapsible sections: shadcn `Collapsible` or framer-motion `height` animation
- SpendingVelocity: `pace = (spent / amount) / (daysElapsed / totalDaysInPeriod)`; > 1.0 = over pace
- Custom date range: shadcn `Popover` + `Calendar` in range mode

### Validation (Definition of Done)
- [ ] Trends chart shows correct N months of data points
- [ ] Budget vs actual bars correctly align budgeted amount to actual spend for that period
- [ ] Top spending days list is sorted descending by amount
- [ ] Custom date range overrides period tab and updates all charts
- [ ] Collapsible sections expand/collapse with animation

---

## F10 — Ledger: People List
**Status:** `[ ] Not Started`
**Repos:** dime-api (B7) + dime-web (F9)

### Description
Top-level Ledger screen. Shows all people you track money with, their individual net balance, and a global summary of total owed vs total owing.

### How It Works
`/ledger` shows a `SummaryBanner` at the top: "You are owed ₹X" and "You owe ₹Y". Below is a list of `PersonCard` items. Each card shows a colored initial avatar, the person's name, and a `BalanceChip`: green chip if they owe you (net positive), red chip if you owe them (net negative), grey "Settled" chip if net is zero. A "+" FAB opens `PersonForm` — a bottom sheet with name (required), phone (optional), note (optional), and a color picker (10 preset colors for the avatar).

### How It's Developed
- `useLedgerPeople` — `useQuery` fetching `GET /api/ledger/people`; response: `{ people[], summary: { youAreOwed, youOwe } }`
- Backend net balance logic: `sum(GAVE, settled=false) - sum(RECEIVED, settled=false)` per person
- `PersonCard` — avatar `div` with `background: person.color`; initial letter; `BalanceChip` conditional class
- `PersonForm` — shadcn `Sheet`; color picker: 10 preset swatches as radio buttons
- Tapping a card → `router.push('/ledger/' + person.id)`
- Optimistic add/edit; list refetched on return from person detail page

### Validation (Definition of Done)
- [ ] SummaryBanner totals are mathematically correct across all people and entries
- [ ] BalanceChip color is correct: green (positive) / red (negative) / grey (zero)
- [ ] Adding a person appears in the list immediately
- [ ] Empty state shown when no people have been added

---

## F11 — Ledger: Person Detail & Entries
**Status:** `[ ] Not Started`
**Repos:** dime-api (B7 — entry endpoints) + dime-web (F9)

### Description
Per-person view showing the full chronological history of money exchanged. Supports adding, editing, and deleting entries, and a "Settle Up" action to clear the balance.

### How It Works
`/ledger/[personId]` shows the person's name, current net balance, and a "Settle Up" button in a header. Below, entries are grouped: Active first, then Settled (collapsed by default). Each entry shows a directional icon (↑ = you gave, ↓ = you received), the amount (green for gave, red for received), date, and note. Swipe left to delete. Tap to edit in a bottom sheet. The "+" FAB opens `EntryForm`: a type toggle (Gave / Received), amount, date, and note. "Settle Up" opens a confirm dialog showing the total amount being settled; on confirm all unsettled entries for this person are marked settled and the balance resets to ₹0.

### How It's Developed
- `useLedgerEntries(personId)` — `useQuery` fetching `GET /api/ledger/people/:id/entries`
- Two sections in the list: active entries (unsettled), settled entries (collapsed `Collapsible`)
- `EntryItem` — icon + amount (color) + date + note; swipe-to-delete same pattern as `TransactionItem`
- `EntryForm` — shadcn `Sheet`; `SegmentedControl` for GAVE/RECEIVED type; amount + date + note
- `SettleUpDialog` — shadcn `AlertDialog`; shows `formatINR(totalUnsettled)` → on confirm `POST /api/ledger/people/:id/settle`
- Backend settle: `updateMany({ where: { personId, settled: false }, data: { settled: true, settledAt: new Date() } })`

### Validation (Definition of Done)
- [ ] Net balance = sum(GAVE, unsettled) − sum(RECEIVED, unsettled) — matches SummaryBanner
- [ ] Settle Up marks all active entries as settled; net balance shows ₹0 after
- [ ] Settled entries remain visible in a collapsed section with "Settled" badge
- [ ] Person with no entries shows ₹0 balance and an empty state message
- [ ] Swipe-to-delete works on entry items

---

## F12 — Settings: Account Management
**Status:** `[ ] Not Started`
**Repos:** dime-api (B2) + dime-web (F10)

### Description
View and edit your profile name, change your password, and permanently delete your account.

### How It Works
Settings → Account section shows: email address (read-only, greyed out), editable name with an inline save/cancel UI, a "Change Password" section with three fields (old, new, confirm), and a danger zone "Delete Account" button. Clicking Delete Account opens an `AlertDialog` with a text input requiring the user to type "DELETE" exactly before the confirm button enables.

### How It's Developed
- `useCurrentUser` — reads from `useAuthStore`; syncs with `GET /api/auth/me` on mount
- Inline name edit: `isEditing` boolean state; `Input` replaces static text; Save fires `PATCH /api/auth/me { name }`
- Change password: react-hook-form + Zod (`newPassword !== currentPassword`, min 8 chars, passwords match)
- Delete: `AlertDialog` → controlled `Input` → `DELETE /api/auth/me` → `clearAuth()` → `router.replace('/login')`

### Validation (Definition of Done)
- [ ] Name update reflects immediately after save
- [ ] Wrong old password → inline "Incorrect password" error, no redirect
- [ ] Change password with mismatched new/confirm shows validation error
- [ ] Delete account button only enables when "DELETE" is typed exactly
- [ ] After account deletion the session is cleared and user is on `/login`

---

## F13 — Settings: CSV Import / Export
**Status:** `[ ] Not Started`
**Repos:** dime-api (B8) + dime-web (F10)

### Description
Data portability — download all transactions as a CSV, or upload a CSV file to import transactions with a preview step.

### How It Works
Settings → Data section has two buttons: "Export CSV" and "Import CSV". Export triggers an immediate file download (`dime-export-YYYY-MM-DD.csv`) with columns: `Date, Amount, Type, Category, Note`. Import opens a native file picker; after selecting a `.csv` file, a preview modal shows the import summary ("250 will be imported, 3 skipped as duplicates, 2 have errors") and lists error rows. Clicking "Import" commits the data.

### How It's Developed
- **Export:** `fetch(GET /api/csv/export, { headers: { Authorization } })` → `response.blob()` → `URL.createObjectURL` → programmatic `<a>` click with `download` attribute
- **Import:** `<input type="file" accept=".csv" ref={fileRef}>` hidden; "Import CSV" button triggers `fileRef.current.click()`; `onChange` → `FileReader.readAsText` → `papaparse.parse` (client-side preview validation) → `POST /api/csv/import` as `FormData`; show `ImportPreviewModal` with server response
- Backend: `@fastify/multipart` receives file; `csv-parse` parses rows; row validation (amount is number, date is valid, category name exists); duplicate check (`WHERE date=X AND amount=Y AND categoryId=Z`); returns `{ imported, skipped, errors: [{ row, reason }] }`

### Validation (Definition of Done)
- [ ] Export downloads a valid CSV with correct column headers
- [ ] Export file contains all user transactions (optionally filtered by date range)
- [ ] Import preview modal shows accurate counts before confirming
- [ ] Malformed rows (bad date, non-numeric amount) are reported in errors, not imported
- [ ] Duplicate rows (same date + amount + category) are skipped and counted
- [ ] Confirmed import creates transactions under the authenticated user

---

## F14 — PWA & Installability
**Status:** `[ ] Not Started`
**Repos:** dime-web (F11)

### Description
Makes Dime installable as a standalone app on Android (via Chrome's Add to Home Screen prompt) and iOS (via Safari's Share → Add to Home Screen). When launched from the home screen the app appears fullscreen with no browser chrome.

### How It Works
On Android Chrome, after a few visits, the browser shows a native "Add to Home Screen" prompt automatically (driven by the Web App Manifest + service worker). On iOS 16.4+ users add it manually via the Share sheet. Once installed and opened from the home screen, the app runs in `standalone` display mode — no address bar, no browser tabs.

### How It's Developed
- `public/manifest.json` — `name: "Dime"`, `short_name: "Dime"`, `display: "standalone"`, `start_url: "/"`, `theme_color: "#ffffff"`, icons array: 192×192, 512×512, 512×512 maskable
- `next-pwa` plugin in `next.config.ts` — `generateSW: true`, caches static assets cache-first
- Root layout: `<meta name="theme-color" content="...">` (updated per active theme), `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- App icons: 3 PNG files at the correct sizes in `public/icons/`
- `robots.txt` — disallow all (app requires login, nothing to index)

### Validation (Definition of Done)
- [ ] Chrome DevTools → Application → Manifest shows no errors or warnings
- [ ] Lighthouse PWA audit score ≥ 90
- [ ] Android Chrome shows "Add to Home Screen" install prompt
- [ ] iOS Safari Share menu shows the correct app name and icon
- [ ] Launching from home screen shows no browser chrome (standalone mode)
- [ ] App icon and splash screen display correctly on both platforms
