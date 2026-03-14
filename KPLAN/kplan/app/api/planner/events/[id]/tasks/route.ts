import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications/create-notification"

const Params = z.object({ id: z.string().uuid() })

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  due_at: z.string().nullish(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  category: z.string().max(100).nullish(),
  requires_client_validation: z.boolean().default(false),
  milestone_id: z.string().uuid().nullish(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  assigned_to: z.string().max(100).nullish(),
  is_dayof: z.boolean().optional(),
})

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 })

  const url = new URL(req.url)
  const statusFilter = url.searchParams.get("status")
  const milestoneFilter = url.searchParams.get("milestone_id")
  const priorityFilter = url.searchParams.get("priority")
  const dayofFilter = url.searchParams.get("dayof")

  const db = supabaseAdmin()

  let query = db
    .from("tasks")
    .select("id, title, description, due_at, priority, status, category, requires_client_validation, milestone_id, created_at, updated_at, event_id, scheduled_time, assigned_to, is_dayof")
    .eq("event_id", parsed.data.id)

  if (dayofFilter === "true") {
    query = query.eq("is_dayof", true)
    query = query.order("scheduled_time", { ascending: true, nullsFirst: false })
  } else {
    query = query.order("created_at", { ascending: false })
  }

  if (dayofFilter !== "true") {
    if (statusFilter && statusFilter !== "all")
      query = query.eq("status", statusFilter)
    if (milestoneFilter) query = query.eq("milestone_id", milestoneFilter)
    if (priorityFilter && priorityFilter !== "all")
      query = query.eq("priority", priorityFilter)
  }

  const { data: tasks, error } = await query

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  const allTasks = tasks ?? []

  // Fetch comment counts
  const taskIds = allTasks.map((t) => t.id)
  let commentCounts = new Map<string, number>()
  if (taskIds.length > 0) {
    const { data: comments } = await db
      .from("task_comments")
      .select("task_id")
      .in("task_id", taskIds)

    ;(comments ?? []).forEach((c: any) => {
      commentCounts.set(c.task_id, (commentCounts.get(c.task_id) ?? 0) + 1)
    })
  }

  // Fetch validations
  let validationsByTask = new Map<
    string,
    { status: string; client_comment: string | null }
  >()
  if (taskIds.length > 0) {
    const { data: validations } = await db
      .from("task_validations")
      .select("task_id, status, client_comment")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false })

    ;(validations ?? []).forEach((v: any) => {
      if (!validationsByTask.has(v.task_id)) {
        validationsByTask.set(v.task_id, {
          status: v.status,
          client_comment: v.client_comment,
        })
      }
    })
  }

  const enriched = allTasks.map((t) => ({
    ...t,
    comments_count: commentCounts.get(t.id) ?? 0,
    validation: validationsByTask.get(t.id) ?? null,
  }))

  // Progress
  const total = allTasks.length
  const completed = allTasks.filter((t) => t.status === "done").length
  const now = new Date().toISOString()
  const overdue = allTasks.filter(
    (t) => t.due_at && t.due_at < now && t.status !== "done",
  ).length

  return NextResponse.json({
    tasks: enriched,
    progress: {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      overdue_count: overdue,
    },
  })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 })

  const json = await req.json().catch(() => null)
  const body = CreateTaskSchema.safeParse(json)
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )

  const db = supabaseAdmin()

  const { data: task, error } = await db
    .from("tasks")
    .insert({
      event_id: parsed.data.id,
      title: body.data.title,
      description: body.data.description ?? null,
      due_at: body.data.due_at ?? null,
      priority: body.data.priority,
      status: body.data.status,
      category: body.data.category ?? null,
      requires_client_validation: body.data.requires_client_validation,
      milestone_id: body.data.milestone_id ?? null,
      scheduled_time: body.data.scheduled_time ?? null,
      assigned_to: body.data.assigned_to ?? null,
      is_dayof: body.data.is_dayof ?? false,
    })
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  // If requires client validation, create a pending validation + notification
  if (body.data.requires_client_validation) {
    await db.from("task_validations").insert({
      task_id: task.id,
      event_id: parsed.data.id,
      status: "pending",
    })

    await createNotification({
      event_id: parsed.data.id,
      recipient_type: "client",
      type: "task_needs_validation",
      title: "Nouvelle tâche à valider",
      message: `La tâche "${task.title}" nécessite votre validation.`,
      related_id: task.id,
    })
  }

  return NextResponse.json({ task }, { status: 201 })
}
