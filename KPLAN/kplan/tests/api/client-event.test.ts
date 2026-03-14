import { describe, it, expect, vi, beforeEach } from "vitest"

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
let eventResult: { data: unknown; error: unknown } = { data: null, error: null }

function buildChain(terminalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(terminalResult))
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminalResult))
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === "client_access") return buildChain(accessResult)
      if (table === "events") return buildChain(eventResult)
      return buildChain({ data: null, error: null })
    }),
  }),
}))

const { GET } = await import("@/app/api/client/event/route")

const EVENT_ID = "550e8400-e29b-41d4-a716-446655440000"

describe("GET /api/client/event", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser = { data: { user: null }, error: null }
    accessResult = { data: null, error: null }
    eventResult = { data: null, error: null }
  })

  it("returns 400 for missing eventId", async () => {
    const req = new Request("http://localhost/api/client/event")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("returns 401 when no authenticated session", async () => {
    const req = new Request(`http://localhost/api/client/event?eventId=${EVENT_ID}`)
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns 403 for session with no client_access row", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    accessResult = { data: null, error: { code: "PGRST116", message: "no rows" } }
    const req = new Request(`http://localhost/api/client/event?eventId=${EVENT_ID}`)
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it("returns 200 with event for valid session with active access", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    accessResult = {
      data: { event_id: EVENT_ID, is_revoked: false },
      error: null,
    }
    eventResult = {
      data: { id: EVENT_ID, title: "Mariage Test", status: "draft" },
      error: null,
    }
    const req = new Request(`http://localhost/api/client/event?eventId=${EVENT_ID}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event).toBeDefined()
    expect(body.event.title).toBe("Mariage Test")
  })
})
