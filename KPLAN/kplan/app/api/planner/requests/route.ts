import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requirePlannerSession } from "@/lib/server/planner"

export async function GET(req: Request) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const statusFilter = url.searchParams.get("status") || "pending"

  const db = supabaseAdmin()
  
  let query = db
    .from("guest_changes")
    .select(`
      *,
      event:events(id, title, start_at),
      guest:guests(id, first_name, last_name, email)
    `)
    .order("created_at", { ascending: true })

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter)
  }

  const { data: changes, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ changes })
}


