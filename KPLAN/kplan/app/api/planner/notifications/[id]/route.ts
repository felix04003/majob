import { NextResponse } from "next/server"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const { is_read } = body

  if (typeof is_read !== "boolean") {
    return NextResponse.json(
      { error: "is_read must be a boolean" },
      { status: 400 }
    )
  }

  const db = supabaseAdmin()

  const { data: notification, error } = await db
    .from("notifications")
    .update({ is_read })
    .eq("id", id)
    .eq("recipient_type", "planner")
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message || "Notification not found" },
      { status: error.code === "PGRST116" ? 404 : 500 }
    )
  }

  return NextResponse.json({ notification })
}
