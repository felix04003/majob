import { describe, it, expect, vi, beforeEach } from "vitest"

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

describe("GET /api/client/event", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accessResult = { data: null, error: null }
    eventResult = { data: null, error: null }
  })

  it("returns 400 for missing token", async () => {
    const req = new Request("http://localhost/api/client/event")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 for short token", async () => {
    const req = new Request("http://localhost/api/client/event?token=abc")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("returns 401 for invalid token", async () => {
    accessResult = { data: null, error: { message: "not found" } }
    const req = new Request(
      "http://localhost/api/client/event?token=invalid-token-123456"
    )
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns 401 for expired token", async () => {
    accessResult = {
      data: {
        event_id: "e1",
        expires_at: new Date(Date.now() - 86400_000).toISOString(), // yesterday
      },
      error: null,
    }
    const req = new Request(
      "http://localhost/api/client/event?token=expired-token-123456"
    )
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns 200 with event for valid token", async () => {
    accessResult = {
      data: { event_id: "e1", expires_at: null },
      error: null,
    }
    eventResult = {
      data: { id: "e1", title: "Mariage Test", status: "draft" },
      error: null,
    }
    const req = new Request(
      "http://localhost/api/client/event?token=valid-client-token-1234"
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event).toBeDefined()
    expect(body.event.title).toBe("Mariage Test")
  })
})
