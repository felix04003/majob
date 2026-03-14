import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequest } from "./__helpers"

// ─── Mock planner session ──────────────────────────────────────────────────
let mockPlannerOk = true
vi.mock("@/lib/server/planner", () => ({
  requirePlannerSession: vi.fn(() =>
    Promise.resolve(
      mockPlannerOk
        ? { ok: true as const, user: { id: "planner-1", email: "planner@test.com" } }
        : { ok: false as const, response: new Response(null, { status: 401 }) },
    )
  ),
}))

// ─── Mock supabaseAdmin ────────────────────────────────────────────────────
let mockSelectResult: { data: unknown; error: unknown } = { data: [], error: null }
let mockMaybeSingleResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockUpdateResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockInviteResult: { data: { user: { id: string } | null }; error: unknown } = {
  data: { user: { id: "new-user-1" } },
  error: null,
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn((_table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve(mockInsertResult)),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve(mockUpdateResult)),
      })),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve(mockSelectResult)),
      maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
      single: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
    })),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(() => Promise.resolve(mockInviteResult)),
      },
    },
  }),
}))

const { GET, POST } = await import("@/app/api/planner/events/[id]/client-accounts/route")
const { DELETE } = await import("@/app/api/planner/events/[id]/client-accounts/[uid]/route")

beforeEach(() => {
  mockPlannerOk = true
  mockSelectResult = { data: [], error: null }
  mockMaybeSingleResult = { data: null, error: null }
  mockUpdateResult = { data: null, error: null }
  mockInsertResult = { data: null, error: null }
  mockInviteResult = { data: { user: { id: "new-user-1" } }, error: null }
})

describe("GET /api/planner/events/[id]/client-accounts", () => {
  it("returns 401 when not authenticated as planner", async () => {
    mockPlannerOk = false
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts")
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await GET(req, context)
    expect(res.status).toBe(401)
  })

  it("returns 200 with account list", async () => {
    mockSelectResult = {
      data: [{ id: "acc-1", email: "client@test.com", is_revoked: false, invited_at: new Date().toISOString(), user_id: "u1" }],
      error: null,
    }
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts")
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await GET(req, context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accounts).toHaveLength(1)
  })
})

describe("POST /api/planner/events/[id]/client-accounts", () => {
  it("returns 400 for invalid email", async () => {
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts", {
      json: { email: "not-an-email" },
    })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await POST(req, context)
    expect(res.status).toBe(400)
  })

  it("returns 409 when client already has active access", async () => {
    mockMaybeSingleResult = { data: { id: "acc-existing", is_revoked: false }, error: null }
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts", {
      json: { email: "client@test.com" },
    })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await POST(req, context)
    expect(res.status).toBe(409)
  })
})

describe("DELETE /api/planner/events/[id]/client-accounts/[uid]", () => {
  it("returns 401 when not authenticated as planner", async () => {
    mockPlannerOk = false
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts/acc-1", { method: "DELETE" })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc", uid: "3e7c3f19-4b2a-4f6d-9e1c-000000000001" }) }
    const res = await DELETE(req, context)
    expect(res.status).toBe(401)
  })

  it("returns 200 on successful revoke", async () => {
    mockUpdateResult = { data: { id: "acc-1" }, error: null }
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts/acc-1", { method: "DELETE" })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc", uid: "3e7c3f19-4b2a-4f6d-9e1c-000000000001" }) }
    const res = await DELETE(req, context)
    expect(res.status).toBe(200)
  })
})
