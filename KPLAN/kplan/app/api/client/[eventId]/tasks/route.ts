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
    .select("id, title, start_at")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const { data: tasks, error: te } = await db
    .from("tasks")
    .select("*")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (te) return NextResponse.json({ error: te.message }, { status: 500 })

  const { data: milestones } = await db
    .from("milestones")
    .select("id, name")
    .eq("event_id", gate.eventId)

  const milestoneMap: Record<string, string> = {}
  ;(milestones ?? []).forEach((m: any) => { milestoneMap[m.id] = m.name })

  const { data: comments, error: ce } = await db
    .from("task_comments")
    .select("task_id")
    .eq("event_id", gate.eventId)

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })

  const { data: validations, error: ve } = await db
    .from("task_validations")
    .select("task_id, status, client_comment")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (ve) return NextResponse.json({ error: ve.message }, { status: 500 })

  const commentsByTask: Record<string, number> = {}
  comments?.forEach((c) => { commentsByTask[c.task_id] = (commentsByTask[c.task_id] || 0) + 1 })

  const validationByTask: Record<string, { status: string; comment: string | null }> = {}
  validations?.forEach((v: any) => {
    if (!validationByTask[v.task_id]) {
      validationByTask[v.task_id] = { status: v.status, comment: v.client_comment }
    }
  })

  const enrichedTasks = (tasks || []).map((task: any) => ({
    ...task,
    due_date: task.due_at,
    milestone_title: task.milestone_id ? (milestoneMap[task.milestone_id] ?? null) : null,
    comments_count: commentsByTask[task.id] || 0,
    validation: validationByTask[task.id] || null,
  }))

  const total = enrichedTasks.length
  const completed = enrichedTasks.filter((t: any) => t.status === "done").length
  const overdue_count = enrichedTasks.filter(
    (t: any) => t.status !== "done" && t.due_at && new Date(t.due_at) < new Date(),
  ).length

  return NextResponse.json({
    tasks: enrichedTasks,
    progress: { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, overdue_count },
    event: { id: event.id, title: event.title, start_at: event.start_at },
  })
}
