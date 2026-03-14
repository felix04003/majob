import { NextResponse } from "next/server"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST() {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  // Update all unread notifications for the planner to read
  const { count, error } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_type", "planner")
    .eq("is_read", false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: count ?? 0,
  })
}
