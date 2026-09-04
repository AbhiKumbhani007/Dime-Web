import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ServiceWorkerRegister } from '@/components/providers/ServiceWorkerRegister'

describe('ServiceWorkerRegister', () => {
  const originalServiceWorker = (navigator as unknown as { serviceWorker?: unknown })
    .serviceWorker

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('registers /sw.js when the browser supports service workers', () => {
    const register = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    })

    render(<ServiceWorkerRegister />)

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('renders nothing', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    const { container } = render(<ServiceWorkerRegister />)

    expect(container).toBeEmptyDOMElement()
  })

  it('does not throw when the browser has no serviceWorker support', () => {
    // Simulate an unsupported browser by removing the property entirely
    // (not just setting it to undefined) so `'serviceWorker' in navigator`
    // is false, matching real-world unsupported browsers.
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker

    expect(() => render(<ServiceWorkerRegister />)).not.toThrow()
  })
})

describe('ServiceWorkerRegister registration failure', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: vi.fn().mockRejectedValue(new Error('nope')) },
      configurable: true,
    })
  })

  it('swallows a rejected registration instead of throwing', () => {
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow()
  })
})
