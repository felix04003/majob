import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequest } from "./__helpers"

// ---------------------------------------------------------------------------
// Mock rate-limit — contrôlable par test via mockRateLimitOk
// ---------------------------------------------------------------------------
let mockRateLimitOk = true
let mockRetryAfter = 0

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() =>
    mockRateLimitOk ? { ok: true } : { ok: false, retryAfter: mockRetryAfter }
  ),
}))

// ---------------------------------------------------------------------------
// Mock supabaseAdmin – we intercept @/lib/supabase/admin
// ---------------------------------------------------------------------------
const mockInsert = vi.fn(() => ({ error: null }))
const mockUpdate = vi.fn(() => ({
  eq: vi.fn(() => ({ error: null })),
}))

let passResult: { data: unknown; error: unknown } = { data: null, error: null }
let checkinResult: { data: unknown; error: unknown } = { data: null, error: null }

function buildChain(terminalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn(() => chain)
  chain.insert = mockInsert
  chain.update = mockUpdate
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminalResult))
  chain.single = vi.fn(() => Promise.resolve(terminalResult))
  return chain
}

let callCount = 0
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === "qr_passes") return buildChain(passResult)
      if (table === "checkins") {
        callCount++
        // First call to checkins is the lookup, second is the insert
        if (checkinResult.data) return buildChain(checkinResult)
        return { ...buildChain({ data: null, error: null }), insert: mockInsert }
      }
      return buildChain({ data: null, error: null })
    }),
  }),
}))

// Import AFTER mocking
const { POST } = await import("@/app/api/scan/route")

describe("POST /api/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callCount = 0
    passResult = { data: null, error: null }
    checkinResult = { data: null, error: null }
    mockRateLimitOk = true
    mockRetryAfter = 0
  })

  it("returns 400 for missing qrToken", async () => {
    const req = createRequest("http://localhost/api/scan", { json: {} })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/qrToken/i)
  })

  it("returns 400 for short qrToken", async () => {
    const req = createRequest("http://localhost/api/scan", {
      json: { qrToken: "abc" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 'invalid' for unknown qrToken", async () => {
    passResult = { data: null, error: null }
    const req = createRequest("http://localhost/api/scan", {
      json: { qrToken: "unknown-token-value-1234" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result).toBe("invalid")
  })

  it("returns 'revoked' for revoked pass", async () => {
    passResult = {
      data: { event_id: "e1", guest_id: "g1", is_active: false },
      error: null,
    }
    const req = createRequest("http://localhost/api/scan", {
      json: { qrToken: "revoked-token-value-1234" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result).toBe("revoked")
  })

  describe("rate limiting", () => {
    it("returns 429 with Retry-After when rate limit exceeded", async () => {
      mockRateLimitOk = false
      mockRetryAfter = 45
      const req = createRequest("http://localhost/api/scan", {
        json: { qrToken: "some-valid-qr-token-1234" },
        headers: { "x-forwarded-for": "1.2.3.4" },
      })
      const res = await POST(req)
      expect(res.status).toBe(429)
      expect(res.headers.get("Retry-After")).toBe("45")
      const body = await res.json()
      expect(body.error).toBe("Too many requests")
    })
  })
})
