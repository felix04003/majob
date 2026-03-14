import { NextResponse } from "next/server"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function GET(req: Request) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const isReadFilter = url.searchParams.get("is_read")
  const typeFilter = url.searchParams.get("type")
  const limitStr = url.searchParams.get("limit") || "50"
  const limit = Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500)

  const db = supabaseAdmin()

  // Build the main query
  let query = db
    .from("notifications")
    .select("*")
    .eq("recipient_type", "planner")
    .order("created_at", { ascending: false })
    .limit(limit)

  // Apply is_read filter if specified
  if (isReadFilter !== null) {
    const isRead = isReadFilter === "true"
    query = query.eq("is_read", isRead)
  }

  // Apply type filter if specified
  if (typeFilter) {
    query = query.eq("type", typeFilter)
  }

  const { data: notifications, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Count unread notifications
  const { count: unreadCount, error: countError } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_type", "planner")
    .eq("is_read", false)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  return NextResponse.json({
    notifications: notifications || [],
    unread_count: unreadCount ?? 0,
  })
}
