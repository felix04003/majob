import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get("eventId") ?? ""
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 })

  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: event, error: ee } = await db
    .from("events")
    .select("*")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  return NextResponse.json({ event })
}
