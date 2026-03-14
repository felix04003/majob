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

  const { data: event, error: ee } = await db
    .from("events")
    .select("id, title")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const now = new Date().toISOString()
  const { data: appointments, error: ae } = await db
    .from("appointments")
    .select("*")
    .eq("event_id", gate.eventId)
    .gte("start_at", now)
    .order("start_at", { ascending: true })

  if (ae) return NextResponse.json({ error: ae.message }, { status: 500 })
  return NextResponse.json({ event: { id: event.id, title: event.title }, appointments: appointments || [] })
}
