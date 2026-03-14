import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({
  id: z.string().uuid(),
  appointmentId: z.string().uuid(),
})

const UpdateAppointmentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  start_at: z.string().optional(),
  duration_minutes: z.number().int().min(5).max(1440).optional(),
  location: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  appointment_type: z
    .enum(["rdv_client", "prestataire", "visite_lieu", "degustation", "other"])
    .optional(),
  attendees: z.string().max(500).optional().nullable(),
})

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; appointmentId: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const json = await req.json().catch(() => null)
  const body = UpdateAppointmentSchema.safeParse(json)
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (body.data.title !== undefined) updates.title = body.data.title
  if (body.data.start_at !== undefined) updates.start_at = body.data.start_at
  if (body.data.duration_minutes !== undefined)
    updates.duration_minutes = body.data.duration_minutes
  if (body.data.location !== undefined) updates.location = body.data.location
  if (body.data.notes !== undefined) updates.notes = body.data.notes
  if (body.data.appointment_type !== undefined)
    updates.appointment_type = body.data.appointment_type
  if (body.data.attendees !== undefined) updates.attendees = body.data.attendees

  const { data: appointment, error } = await db
    .from("appointments")
    .update(updates)
    .eq("id", parsed.data.appointmentId)
    .eq("event_id", parsed.data.id)
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ appointment })
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string; appointmentId: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const db = supabaseAdmin()

  const { error } = await db
    .from("appointments")
    .delete()
    .eq("id", parsed.data.appointmentId)
    .eq("event_id", parsed.data.id)

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
