import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid(), uid: z.string().uuid() })

// DELETE — revoke a client's access (by client_access.id, not user id)
export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string; uid: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const { id: eventId, uid: accessId } = parsed.data
  const db = supabaseAdmin()

  const { data: updated, error } = await db
    .from("client_access")
    .update({ is_revoked: true })
    .eq("id", accessId)
    .eq("event_id", eventId) // safety check: must belong to this event
    .select("id")
    .single()

  if (error && error.code !== "PGRST116") return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: "Access record not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
