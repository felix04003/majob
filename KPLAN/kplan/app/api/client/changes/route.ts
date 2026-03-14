import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientAccess } from "@/lib/server/client"

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: changes, error } = await db
    .from("guest_changes")
    .select("*")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ changes })
}


