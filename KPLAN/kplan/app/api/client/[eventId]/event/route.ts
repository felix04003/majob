import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: event, error } = await db
    .from("events")
    .select("*")
    .eq("id", gate.eventId)
    .single()

  if (error || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  return NextResponse.json({ event })
}
