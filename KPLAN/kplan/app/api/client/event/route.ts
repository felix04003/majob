import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientAccess } from "@/lib/server/client"

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
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
