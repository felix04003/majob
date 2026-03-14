import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })

const CreateMilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  target_date: z.string().nullish(),
  position: z.number().int().min(0).default(0),
})

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 })

  const db = supabaseAdmin()
  const { data: milestones, error } = await db
    .from("milestones")
    .select("*")
    .eq("event_id", parsed.data.id)
    .order("position", { ascending: true })

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ milestones: milestones ?? [] })
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
  const body = CreateMilestoneSchema.safeParse(json)
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )

  const db = supabaseAdmin()
  const { data: milestone, error } = await db
    .from("milestones")
    .insert({
      event_id: parsed.data.id,
      name: body.data.name,
      description: body.data.description ?? null,
      target_date: body.data.target_date ?? null,
      position: body.data.position,
    })
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ milestone }, { status: 201 })
}
