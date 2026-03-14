import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequest } from "./__helpers"

// ---------------------------------------------------------------------------
// Mock supabaseAdmin
// ---------------------------------------------------------------------------
let invResult: { data: unknown; error: unknown } = { data: null, error: null }
let updateError: unknown = null
let passExistsResult: { data: unknown; error: unknown } = { data: null, error: null }
let insertPassError: unknown = null

function buildChain(terminalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.insert = vi.fn(() => ({ error: insertPassError }))
  chain.update = vi.fn(() => ({
    eq: vi.fn(() => ({ error: updateError })),
  }))
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminalResult))
  chain.single = vi.fn(() => Promise.resolve(terminalResult))
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === "invitations") return buildChain(invResult)
      if (table === "guests") return buildChain({ data: null, error: updateError })
      if (table === "qr_passes") return buildChain(passExistsResult)
      return buildChain({ data: null, error: null })
    }),
  }),
}))

const { POST } = await import("@/app/api/rsvp/route")

describe("POST /api/rsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invResult = { data: null, error: null }
    updateError = null
    passExistsResult = { data: null, error: null }
    insertPassError = null
  })

  it("returns 400 for missing body", async () => {
    const req = createRequest("http://localhost/api/rsvp", { json: {} })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid rsvp value", async () => {
    const req = createRequest("http://localhost/api/rsvp", {
      json: { inviteToken: "valid-token-12345678", rsvp: "banana" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 for short inviteToken", async () => {
    const req = createRequest("http://localhost/api/rsvp", {
      json: { inviteToken: "abc", rsvp: "yes" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 401 for unknown inviteToken", async () => {
    invResult = { data: null, error: { message: "not found" } }
    const req = createRequest("http://localhost/api/rsvp", {
      json: { inviteToken: "unknown-token-1234567", rsvp: "yes" },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns ok for valid RSVP", async () => {
    invResult = { data: { guest_id: "g1", event_id: "e1" }, error: null }
    const req = createRequest("http://localhost/api/rsvp", {
      json: { inviteToken: "valid-token-12345678", rsvp: "yes" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
