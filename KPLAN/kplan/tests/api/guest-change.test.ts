import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequest } from "./__helpers"

// ---------------------------------------------------------------------------
// Mock supabaseServer (session cookie)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock supabaseAdmin
// ---------------------------------------------------------------------------
let accessResult: { data: unknown; error: unknown } = { data: null, error: null }
let guestResult: { data: unknown; error: unknown } = { data: null, error: null }
let insertResult: { data: unknown; error: unknown } = { data: null, error: null }

function buildChain(terminalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn(() => chain)
  chain.insert = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(terminalResult))
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminalResult))
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === "client_access") return buildChain(accessResult)
      if (table === "guests") return buildChain(guestResult)
      if (table === "guest_changes") return buildChain(insertResult)
      return buildChain({ data: null, error: null })
    }),
  }),
}))

const { POST } = await import("@/app/api/client/guest-change/route")

const EVENT_ID = "550e8400-e29b-41d4-a716-446655440000"

describe("POST /api/client/guest-change", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser = { data: { user: null }, error: null }
    accessResult = { data: null, error: null }
    guestResult = { data: null, error: null }
    insertResult = { data: null, error: null }
  })

  it("returns 400 for invalid body", async () => {
    const req = createRequest("http://localhost/api/client/guest-change", {
      json: {},
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 for update without guestId", async () => {
    const req = createRequest("http://localhost/api/client/guest-change", {
      json: {
        eventId: EVENT_ID,
        action: "update",
        // no guestId
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 401 for missing session", async () => {
    const req = createRequest("http://localhost/api/client/guest-change", {
      json: {
        eventId: EVENT_ID,
        action: "create",
        payload: { first_name: "Test", last_name: "User" },
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 200 for valid create request", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    accessResult = {
      data: { event_id: EVENT_ID, is_revoked: false },
      error: null,
    }
    insertResult = {
      data: {
        id: "gc1",
        event_id: EVENT_ID,
        action: "create",
        status: "pending",
      },
      error: null,
    }
    const req = createRequest("http://localhost/api/client/guest-change", {
      json: {
        eventId: EVENT_ID,
        action: "create",
        payload: { first_name: "Marie", last_name: "Dupont" },
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.change).toBeDefined()
    expect(body.change.status).toBe("pending")
  })
})
