import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get("eventId") ?? ""
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  // Fetch event info
  const { data: event, error: ee } = await db
    .from("events")
    .select("id, title")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  // Fetch upcoming appointments (start_at >= now) ordered by start_at
  const now = new Date().toISOString()
  const { data: appointments, error: ae2 } = await db
    .from("appointments")
    .select("*")
    .eq("event_id", gate.eventId)
    .gte("start_at", now)
    .order("start_at", { ascending: true })

  if (ae2) return NextResponse.json({ error: ae2.message }, { status: 500 })

  return NextResponse.json({
    event: { id: event.id, title: event.title },
    appointments: appointments || [],
  })
}
