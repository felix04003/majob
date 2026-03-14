import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })

const UpdateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  start_at: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled", "completed"]).optional(),
  invitation_template: z.string().optional(),
  invitation_image_url: z.string().url().nullish(),
  canva_design_id: z.string().nullish(),
  invitation_custom: z.object({
    message: z.string().optional(),
    program: z.array(z.object({ time: z.string(), label: z.string() })).optional(),
    hideCountdown: z.boolean().optional(),
    hideProgram: z.boolean().optional(),
  }).nullish(),
})

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()

  const { data: event, error: ee } = await db.from("events").select("*").eq("id", parsed.data.id).single()
  if (ee || !event) return NextResponse.json({ error: ee?.message ?? "Event not found" }, { status: 404 })

  const { data: access } = await db
    .from("client_access")
    .select("id,event_id,client_token,expires_at,created_at")
    .eq("event_id", parsed.data.id)
    .order("created_at", { ascending: false })

  const clientAccess = (access ?? [])[0] ?? null

  const [{ count: guestsCount }, { count: pendingChangesCount }] = await Promise.all([
    db.from("guests").select("id", { count: "exact", head: true }).eq("event_id", parsed.data.id).is("deleted_at", null),
    db.from("guest_changes").select("id", { count: "exact", head: true }).eq("event_id", parsed.data.id).eq("status", "pending"),
  ])

  return NextResponse.json({
    event,
    clientAccess,
    counts: {
      guests: guestsCount ?? 0,
      pendingChanges: pendingChangesCount ?? 0,
    },
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const json = await req.json().catch(() => null)
  const updateData = UpdateEventSchema.safeParse(json)
  if (!updateData.success) {
    return NextResponse.json({ error: "Invalid data", details: updateData.error.issues }, { status: 400 })
  }

  const db = supabaseAdmin()

  const updates: any = { updated_at: new Date().toISOString() }
  if (updateData.data.title !== undefined) updates.title = updateData.data.title
  if (updateData.data.type !== undefined) updates.type = updateData.data.type
  if (updateData.data.start_at !== undefined) updates.start_at = updateData.data.start_at
  if (updateData.data.venue_name !== undefined) updates.venue_name = updateData.data.venue_name
  if (updateData.data.venue_address !== undefined) updates.venue_address = updateData.data.venue_address
  if (updateData.data.status !== undefined) updates.status = updateData.data.status
  if (updateData.data.invitation_template !== undefined) updates.invitation_template = updateData.data.invitation_template
  if (updateData.data.invitation_image_url !== undefined) updates.invitation_image_url = updateData.data.invitation_image_url
  if (updateData.data.canva_design_id !== undefined) updates.canva_design_id = updateData.data.canva_design_id
  if (updateData.data.invitation_custom !== undefined) updates.invitation_custom = updateData.data.invitation_custom

  const { data: event, error } = await db
    .from("events")
    .update(updates)
    .eq("id", parsed.data.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ event })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()

  const { error } = await db.from("events").delete().eq("id", parsed.data.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true }, { status: 200 })
}


