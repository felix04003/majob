import { describe, it, expect, beforeEach } from "vitest"
import { rateLimit, _resetStore } from "@/lib/rate-limit"

describe("rateLimit", () => {
  beforeEach(() => {
    _resetStore()
  })

  it("allows first request", () => {
    const result = rateLimit("ip-1", { limit: 3, windowMs: 60_000 })
    expect(result.ok).toBe(true)
  })

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 3; i++) {
      const result = rateLimit("ip-2", { limit: 3, windowMs: 60_000 })
      expect(result.ok).toBe(true)
    }
  })

  it("blocks the request exceeding the limit", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-3", { limit: 3, windowMs: 60_000 })
    const result = rateLimit("ip-3", { limit: 3, windowMs: 60_000 })
    expect(result.ok).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it("isolates different IPs", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-4", { limit: 3, windowMs: 60_000 })
    const result = rateLimit("ip-5", { limit: 3, windowMs: 60_000 })
    expect(result.ok).toBe(true)
  })

  it("resets after window expires", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-6", { limit: 3, windowMs: 1 })
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = rateLimit("ip-6", { limit: 3, windowMs: 1 })
        expect(result.ok).toBe(true)
        resolve()
      }, 5)
    })
  })
})
