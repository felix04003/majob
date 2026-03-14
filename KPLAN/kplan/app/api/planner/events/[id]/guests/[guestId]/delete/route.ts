import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid(), guestId: z.string().uuid() })

export async function POST(_: Request, context: { params: Promise<{ id: string; guestId: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const db = supabaseAdmin()

  // Guard: ensure guest belongs to event and is not already deleted
  const { data: g, error: ge } = await db
    .from("guests")
    .select("id,event_id,deleted_at")
    .eq("id", parsed.data.guestId)
    .maybeSingle()

  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })
  if (!g) return NextResponse.json({ error: "Guest not found" }, { status: 404 })
  if (g.event_id !== parsed.data.id) return NextResponse.json({ error: "Guest does not belong to event" }, { status: 403 })
  if (g.deleted_at) return NextResponse.json({ error: "Guest already deleted" }, { status: 409 })

  const now = new Date().toISOString()
  const { error: de } = await db.from("guests").update({ deleted_at: now }).eq("id", parsed.data.guestId)
  if (de) return NextResponse.json({ error: de.message }, { status: 500 })

  await db.from("qr_passes").update({ is_active: false, revoked_at: now }).eq("guest_id", parsed.data.guestId)

  return NextResponse.json({ ok: true })
}



