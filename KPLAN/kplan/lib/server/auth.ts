import { NextResponse } from "next/server"

export function getBearerToken(req: Request) {
  const h = req.headers.get("authorization")
  if (!h) return null
  const [type, token] = h.split(" ")
  if (type?.toLowerCase() !== "bearer") return null
  return token?.trim() || null
}

export function requirePlannerKey(req: Request) {
  const expected = process.env.KPLAN_PLANNER_API_KEY
  if (!expected) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Server misconfigured: missing KPLAN_PLANNER_API_KEY" },
        { status: 500 }
      ),
    }
  }

  const got = getBearerToken(req)
  if (!got || got !== expected) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { ok: true as const }
}


