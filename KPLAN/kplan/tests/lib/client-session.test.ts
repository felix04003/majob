import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock supabaseServer (reads session cookie) ────────────────────────────
let mockGetUser: { data: { user: unknown }; error: unknown } = {
  data: { user: null },
  error: null,
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () =>
    Promise.resolve({
      auth: { getUser: vi.fn(() => Promise.resolve(mockGetUser)) },
    }),
}))

// ─── Mock supabaseAdmin (DB queries) ──────────────────────────────────────
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

const { requireClientSession } = await import("@/lib/server/client")

describe("requireClientSession", () => {
  const EVENT_ID = "event-uuid-1234"

  beforeEach(() => {
    mockGetUser = { data: { user: null }, error: null }
    mockAccessResult = { data: null, error: null }
  })

  it("returns 401 when no authenticated session", async () => {
    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it("returns 403 when session exists but no client_access row", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    // PGRST116 = PostgREST "no rows found" — must use this code so the
    // implementation falls through to the !access check (returns 403),
    // rather than treating it as a generic DB error (returns 500).
    mockAccessResult = { data: null, error: { code: "PGRST116", message: "no rows" } }

    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns 403 when access is revoked", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    mockAccessResult = {
      data: { event_id: EVENT_ID, is_revoked: true },
      error: null,
    }

    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns ok with userId and eventId for valid session with active access", async () => {
    const userId = "user-abc"
    mockGetUser = {
      data: { user: { id: userId, email: "client@test.com" } },
      error: null,
    }
    mockAccessResult = {
      data: { event_id: EVENT_ID, is_revoked: false },
      error: null,
    }

    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.eventId).toBe(EVENT_ID)
      expect(result.userId).toBe(userId)
    }
  })
})
