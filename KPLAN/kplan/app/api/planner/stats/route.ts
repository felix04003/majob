import { NextResponse } from "next/server"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function GET() {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  const nowIso = new Date().toISOString()
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalEvents },
    { count: upcomingEvents },
    { count: totalGuests },
    { count: totalCheckins },
    { data: pendingChanges },
    { count: totalTasks },
    { count: completedTasks },
    { data: overdueTasks },
    { count: pendingValidations },
    { count: upcomingAppointments },
  ] = await Promise.all([
    db.from("events").select("id", { count: "exact", head: true }),
    db
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("start_at", nowIso)
      .in("status", ["draft", "published"]),
    db.from("guests").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("checkins").select("id", { count: "exact", head: true }).eq("result", "valid"),
    db.from("guest_changes").select("created_at").eq("status", "pending"),
    db.from("tasks").select("id", { count: "exact", head: true }),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done"),
    db.from("tasks").select("id, due_at").neq("status", "done").not("due_at", "is", null).lt("due_at", nowIso),
    db.from("task_validations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("appointments").select("id", { count: "exact", head: true }).gte("start_at", nowIso).lte("start_at", sevenDaysLater),
  ])

  const now = Date.now()
  const fourHoursMs = 4 * 60 * 60 * 1000
  const overdueRequests = (pendingChanges || []).filter((change) => {
    const createdAt = new Date(change.created_at).getTime()
    return now - createdAt > fourHoursMs
  }).length

  const stats = {
    totalEvents: totalEvents ?? 0,
    upcomingEvents: upcomingEvents ?? 0,
    totalGuests: totalGuests ?? 0,
    totalCheckins: totalCheckins ?? 0,
    pendingRequests: (pendingChanges || []).length,
    overdueRequests,
    totalTasks: totalTasks ?? 0,
    completedTasks: completedTasks ?? 0,
    overdueTasks: (overdueTasks ?? []).length,
    pendingValidations: pendingValidations ?? 0,
    upcomingAppointments: upcomingAppointments ?? 0,
  }

  return NextResponse.json({ stats })
}
