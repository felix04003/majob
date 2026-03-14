import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientAccess } from "@/lib/server/client"

const Body = z.object({
  clientToken: z.string().min(10),
  action: z.enum(["create", "update", "delete"]),
  guestId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const { clientToken, action, guestId, payload } = parsed.data
  if (action !== "create" && !guestId) return NextResponse.json({ error: "Missing guestId" }, { status: 400 })

  const gate = await requireClientAccess(clientToken)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  // Guard: for update/delete, ensure guest belongs to the event
  if (guestId) {
    const { data: g } = await db.from("guests").select("id,event_id,deleted_at").eq("id", guestId).maybeSingle()
    if (!g) return NextResponse.json({ error: "Guest not found" }, { status: 404 })
    if (g.event_id !== gate.eventId) return NextResponse.json({ error: "Guest does not belong to event" }, { status: 403 })
    if (g.deleted_at) return NextResponse.json({ error: "Guest already deleted" }, { status: 409 })
  }

  const { data: change, error } = await db
    .from("guest_changes")
    .insert({
      event_id: gate.eventId,
      guest_id: guestId ?? null,
      action,
      payload: payload ?? {},
      status: "pending",
      requested_by: "client",
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ change })
}


