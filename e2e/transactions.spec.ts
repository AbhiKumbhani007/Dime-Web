import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'
import { listCategories, createTx } from './helpers/api'

test.describe('Transactions CRUD', () => {
  test('add a transaction from the FAB — optimistic, then confirmed', async ({
    page,
    testUser,
  }) => {
    await loginViaUI(page, testUser)
    await page.getByRole('button', { name: /add transaction/i }).click()
    await page.getByPlaceholder('0.00').fill('150')
    await page.getByPlaceholder('Optional note').fill('Groceries')
    await page.getByRole('button', { name: /^save$/i }).click()

    // Row visible with amount and note
    await expect(page.getByText('Groceries')).toBeVisible()
    await expect(page.getByText(/150/)).toBeVisible()
  })

  test('edit a transaction updates the note in place', async ({
    page,
    testUser,
    api,
  }) => {
    const cats = await listCategories(api)
    const food = cats.find((c) => c.name === 'Food') ?? cats[0]
    const tx = await createTx(api, {
      amount: 220,
      date: new Date().toISOString(),
      note: 'Original',
      isIncome: false,
      categoryId: food.id,
    })

    await loginViaUI(page, testUser)
    await expect(page.getByText('Original')).toBeVisible()

    // Tap the note text (inside the row) rather than the row bounding box —
    // the row contains an aria-hidden overlay for the swipe-delete background
    // that sits in a separate paint layer.
    await page.getByText('Original').click()
    await expect(page.getByRole('heading', { name: /edit transaction/i })).toBeVisible()

    const note = page.getByPlaceholder('Optional note')
    await note.fill('Updated note')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect(page.getByText('Updated note')).toBeVisible()
    await expect(page.getByText('Original')).not.toBeVisible()
  })

  test('swipe-left past threshold removes the item and shows Undo toast', async ({
    page,
    testUser,
    api,
  }, testInfo) => {
    // Swipe is a touch-primary interaction and is fully covered by the
    // Vitest suite (see __tests__/transactions.test.tsx "TransactionItem swipe").
    // Synthesizing a gesture that passes @use-gesture/react's scroll-vs-drag
    // heuristics through Playwright is flaky across environments, so we only
    // attempt it on mobile and use direct pointer events.
    test.skip(
      !testInfo.project.use.hasTouch,
      'Swipe gesture requires touch-capable project'
    )

    const cats = await listCategories(api)
    const tx = await createTx(api, {
      amount: 50,
      date: new Date().toISOString(),
      note: 'Swipe me',
      isIncome: false,
      categoryId: cats[0].id,
    })

    await loginViaUI(page, testUser)
    const row = page.getByTestId(`transaction-${tx.id}`)
    await expect(row).toBeVisible()
    await row.scrollIntoViewIfNeeded()

    // Dispatch native pointer events so @use-gesture/react's drag handler
    // fires (mouse events don't trigger its pointer-based path).
    const rowHandle = await row.elementHandle()
    if (!rowHandle) throw new Error('row handle unavailable')
    const box = await rowHandle.boundingBox()
    if (!box) throw new Error('row box unavailable')

    const startX = box.x + box.width - 30
    const startY = box.y + box.height / 2
    const endX = box.x + 20

    await page.evaluate(
      ({ el, startX, startY, endX, endY }) => {
        function firePointer(type: string, x: number, y: number, buttons = 1) {
          el.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              clientX: x,
              clientY: y,
              buttons,
              button: 0,
              isPrimary: true,
            })
          )
        }
        firePointer('pointerdown', startX, startY, 1)
        const steps = 12
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const x = startX + (endX - startX) * t
          window.dispatchEvent(
            new PointerEvent('pointermove', {
              bubbles: true,
              pointerId: 1,
              pointerType: 'mouse',
              clientX: x,
              clientY: endY,
              buttons: 1,
              isPrimary: true,
            })
          )
        }
        window.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: endX,
            clientY: endY,
            buttons: 0,
            button: 0,
            isPrimary: true,
          })
        )
      },
      {
        el: rowHandle,
        startX,
        startY,
        endX,
        endY: startY,
      }
    )

    await expect(row).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/undo/i).first()).toBeVisible()
  })

  test('form: submitting with empty amount does not create a transaction', async ({
    page,
    testUser,
    api,
  }) => {
    await loginViaUI(page, testUser)
    await page.getByRole('button', { name: /add transaction/i }).click()
    // Leave amount blank
    await page.getByRole('button', { name: /^save$/i }).click()

    // The sheet should still be open (validation failed)
    await expect(page.getByRole('heading', { name: /new transaction/i })).toBeVisible()

    // No transaction created
    const res = await api.get('/api/transactions')
    const body = await res.json()
    expect(body.items).toHaveLength(0)
  })
})
