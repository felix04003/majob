import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get("eventId") ?? ""
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  // Fetch event
  const { data: event, error: ee } = await db
    .from("events")
    .select("id, title, start_at")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  // Fetch all tasks for the event
  const { data: tasks, error: te } = await db
    .from("tasks")
    .select("*")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (te) return NextResponse.json({ error: te.message }, { status: 500 })

  // Fetch milestones to get names
  const { data: milestones } = await db
    .from("milestones")
    .select("id, name")
    .eq("event_id", gate.eventId)

  const milestoneMap: Record<string, string> = {}
  ;(milestones ?? []).forEach((m: any) => {
    milestoneMap[m.id] = m.name
  })

  // Fetch task comments to count per task
  const { data: comments, error: ce } = await db
    .from("task_comments")
    .select("task_id")
    .eq("event_id", gate.eventId)

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })

  // Fetch task validations (with client_comment)
  const { data: validations, error: ve } = await db
    .from("task_validations")
    .select("task_id, status, client_comment")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (ve) return NextResponse.json({ error: ve.message }, { status: 500 })

  // Count comments per task
  const commentsByTask: { [key: string]: number } = {}
  comments?.forEach((c) => {
    commentsByTask[c.task_id] = (commentsByTask[c.task_id] || 0) + 1
  })

  // Create validation map (object with status + comment)
  const validationByTask: Record<string, { status: string; comment: string | null }> = {}
  validations?.forEach((v: any) => {
    if (!validationByTask[v.task_id]) {
      validationByTask[v.task_id] = { status: v.status, comment: v.client_comment }
    }
  })

  // Enrich tasks: map DB fields to what the client component expects
  const enrichedTasks = (tasks || []).map((task: any) => ({
    ...task,
    due_date: task.due_at,
    milestone_title: task.milestone_id ? (milestoneMap[task.milestone_id] ?? null) : null,
    comments_count: commentsByTask[task.id] || 0,
    validation: validationByTask[task.id] || null,
  }))

  // Calculate progress
  const total = enrichedTasks.length
  const completed = enrichedTasks.filter((t: any) => t.status === "done").length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
  const now = new Date()
  const overdue_count = enrichedTasks.filter(
    (t: any) => t.status !== "done" && t.due_at && new Date(t.due_at) < now,
  ).length

  const progress = {
    total,
    completed,
    percentage,
    overdue_count,
  }

  return NextResponse.json({
    tasks: enrichedTasks,
    progress,
    event: {
      id: event.id,
      title: event.title,
      start_at: event.start_at,
    },
  })
}
