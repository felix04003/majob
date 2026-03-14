import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
})

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  due_at: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  category: z.string().max(100).optional().nullable(),
  requires_client_validation: z.boolean().optional(),
  milestone_id: z.string().uuid().optional().nullable(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  assigned_to: z.string().max(100).nullish(),
  is_dayof: z.boolean().optional(),
})

export async function PATCH(
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
  const body = UpdateTaskSchema.safeParse(json)
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )

  const db = supabaseAdmin()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (body.data.title !== undefined) updates.title = body.data.title
  if (body.data.description !== undefined)
    updates.description = body.data.description
  if (body.data.due_at !== undefined) updates.due_at = body.data.due_at
  if (body.data.priority !== undefined) updates.priority = body.data.priority
  if (body.data.status !== undefined) updates.status = body.data.status
  if (body.data.category !== undefined) updates.category = body.data.category
  if (body.data.requires_client_validation !== undefined)
    updates.requires_client_validation = body.data.requires_client_validation
  if (body.data.milestone_id !== undefined)
    updates.milestone_id = body.data.milestone_id
  if (body.data.scheduled_time !== undefined)
    updates.scheduled_time = body.data.scheduled_time
  if (body.data.assigned_to !== undefined)
    updates.assigned_to = body.data.assigned_to
  if (body.data.is_dayof !== undefined) updates.is_dayof = body.data.is_dayof

  const { data: task, error } = await db
    .from("tasks")
    .update(updates)
    .eq("id", parsed.data.taskId)
    .eq("event_id", parsed.data.id)
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ task })
}

export async function DELETE(
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

  const { error } = await db
    .from("tasks")
    .delete()
    .eq("id", parsed.data.taskId)
    .eq("event_id", parsed.data.id)

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
