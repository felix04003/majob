import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
})

const CreateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string; taskId: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const db = supabaseAdmin()
  const { data: comments, error } = await db
    .from("task_comments")
    .select("*")
    .eq("task_id", parsed.data.taskId)
    .eq("event_id", parsed.data.id)
    .order("created_at", { ascending: true })

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comments: comments ?? [] })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; taskId: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const json = await req.json().catch(() => null)
  const body = CreateCommentSchema.safeParse(json)
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )

  const db = supabaseAdmin()

  const { data: comment, error } = await db
    .from("task_comments")
    .insert({
      task_id: parsed.data.taskId,
      event_id: parsed.data.id,
      author_type: "planner",
      author_name: gate.user.email ?? "Planner",
      content: body.data.content,
    })
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comment }, { status: 201 })
}
