import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock supabaseAdmin ────────────────────────────────────────────────────────
let mockAccessResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(mockAccessResult)),
    })),
  }),
}))

const { requireClientAccess } = await import("@/lib/server/client")

describe("requireClientAccess", () => {
  beforeEach(() => {
    mockAccessResult = { data: null, error: null }
  })

  it("returns 400 for empty token", async () => {
    const result = await requireClientAccess("")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it("returns 400 for token shorter than 10 chars", async () => {
    const result = await requireClientAccess("short")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it("returns 401 for unknown token", async () => {
    mockAccessResult = { data: null, error: { message: "not found" } }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body.error).toBe("Invalid token")
    }
  })

  it("returns ok for valid token without expires_at", async () => {
    mockAccessResult = { data: { event_id: "evt-123", expires_at: null }, error: null }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.eventId).toBe("evt-123")
  })

  it("returns ok for valid token with future expires_at", async () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    mockAccessResult = { data: { event_id: "evt-456", expires_at: future }, error: null }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.eventId).toBe("evt-456")
  })

  it("returns 401 for expired token", async () => {
    const past = new Date(Date.now() - 86400_000).toISOString()
    mockAccessResult = { data: { event_id: "evt-789", expires_at: past }, error: null }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body.error).toBe("Token expired")
    }
  })
})
