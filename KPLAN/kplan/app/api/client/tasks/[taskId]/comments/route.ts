import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications/create-notification"
import { requireClientAccess } from "@/lib/server/client"

const PostBodySchema = z.object({
  content: z.string().min(1),
})

export async function GET(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  // Verify task belongs to client's event
  const { data: task, error: te } = await db
    .from("tasks")
    .select("id, event_id")
    .eq("id", taskId)
    .eq("event_id", gate.eventId)
    .single()

  if (te || !task)
    return NextResponse.json(
      { error: "Task not found or unauthorized" },
      { status: 404 },
    )

  // Fetch comments for the task
  const { data: comments, error: ce } = await db
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })

  return NextResponse.json({ comments: comments || [] })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null)
  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const db = supabaseAdmin()

  // Verify task belongs to client's event
  const { data: task, error: te } = await db
    .from("tasks")
    .select("id, event_id, title")
    .eq("id", taskId)
    .eq("event_id", gate.eventId)
    .single()

  if (te || !task)
    return NextResponse.json(
      { error: "Task not found or unauthorized" },
      { status: 404 },
    )

  // Insert comment
  const { data: comment, error: ce } = await db
    .from("task_comments")
    .insert({
      task_id: taskId,
      event_id: gate.eventId,
      author_type: "client",
      author_name: "Client",
      content: parsed.data.content,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (ce || !comment)
    return NextResponse.json(
      { error: ce?.message || "Failed to create comment" },
      { status: 500 },
    )

  // Create notification for planner
  await createNotification({
    event_id: gate.eventId,
    recipient_type: "planner",
    type: "client_commented",
    title: "Nouveau commentaire client",
    message: `Le client a commenté la tâche: "${task.title}"`,
    related_id: taskId,
  })

  return NextResponse.json({ comment }, { status: 201 })
}
