import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({
  id: z.string().uuid(),
  milestoneId: z.string().uuid(),
})

const UpdateMilestoneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  target_date: z.string().optional().nullable(),
  position: z.number().int().min(0).optional(),
})

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; milestoneId: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const json = await req.json().catch(() => null)
  const body = UpdateMilestoneSchema.safeParse(json)
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )

  const db = supabaseAdmin()
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (body.data.name !== undefined) updates.name = body.data.name
  if (body.data.description !== undefined)
    updates.description = body.data.description
  if (body.data.target_date !== undefined)
    updates.target_date = body.data.target_date
  if (body.data.position !== undefined) updates.position = body.data.position

  const { data: milestone, error } = await db
    .from("milestones")
    .update(updates)
    .eq("id", parsed.data.milestoneId)
    .eq("event_id", parsed.data.id)
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ milestone })
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string; milestoneId: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const db = supabaseAdmin()
  const { error } = await db
    .from("milestones")
    .delete()
    .eq("id", parsed.data.milestoneId)
    .eq("event_id", parsed.data.id)

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
