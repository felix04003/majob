import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/rate-limit"

const Body = z.object({ qrToken: z.string().min(10) })

export async function POST(req: Request) {
  // Rate limiting — 30 requêtes / 60s par IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rl = rateLimit(ip, { limit: 30, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    )
  }

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Missing qrToken" }, { status: 400 })

  const db = supabaseAdmin()
  const qrToken = parsed.data.qrToken

  const { data: pass } = await db
    .from("qr_passes")
    .select("event_id, guest_id, is_active")
    .eq("qr_token", qrToken)
    .maybeSingle()

  if (!pass) {
    await db.from("checkins").insert({ qr_token: qrToken, result: "invalid", event_id: null, guest_id: null })
    return NextResponse.json({ result: "invalid" }, { status: 200 })
  }

  if (!pass.is_active) {
    await db
      .from("checkins")
      .insert({ qr_token: qrToken, result: "revoked", event_id: pass.event_id, guest_id: pass.guest_id })
    return NextResponse.json({ result: "revoked" }, { status: 200 })
  }

  const { data: already } = await db
    .from("checkins")
    .select("id")
    .eq("event_id", pass.event_id)
    .eq("guest_id", pass.guest_id)
    .eq("result", "valid")
    .maybeSingle()

  if (already) {
    await db
      .from("checkins")
      .insert({ qr_token: qrToken, result: "already_checked_in", event_id: pass.event_id, guest_id: pass.guest_id })
    return NextResponse.json({ result: "already_checked_in" }, { status: 200 })
  }

  await db.from("checkins").insert({ qr_token: qrToken, result: "valid", event_id: pass.event_id, guest_id: pass.guest_id })
  return NextResponse.json({ result: "valid" }, { status: 200 })
}
