import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })

const CreateAppointmentSchema = z.object({
  title: z.string().min(1).max(200),
  start_at: z.string(),
  duration_minutes: z.number().int().min(5).max(1440).default(60),
  location: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  appointment_type: z
    .enum(["rdv_client", "prestataire", "visite_lieu", "degustation", "other"])
    .default("other"),
  attendees: z.string().max(500).nullish(),
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
  const startDate = url.searchParams.get("start")
  const endDate = url.searchParams.get("end")

  const db = supabaseAdmin()

  let query = db
    .from("appointments")
    .select("*")
    .eq("event_id", parsed.data.id)
    .order("start_at", { ascending: true })

  if (startDate) query = query.gte("start_at", startDate)
  if (endDate) query = query.lte("start_at", endDate)

  const { data: appointments, error } = await query

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ appointments: appointments ?? [] })
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
  const body = CreateAppointmentSchema.safeParse(json)
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid data", details: body.error.issues },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()

  // Verify event exists
  const { data: event } = await db
    .from("events")
    .select("id")
    .eq("id", parsed.data.id)
    .single()

  if (!event)
    return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const { data: appointment, error } = await db
    .from("appointments")
    .insert({
      event_id: parsed.data.id,
      title: body.data.title,
      start_at: body.data.start_at,
      duration_minutes: body.data.duration_minutes,
      location: body.data.location ?? null,
      notes: body.data.notes ?? null,
      appointment_type: body.data.appointment_type,
      attendees: body.data.attendees ?? null,
    })
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ appointment }, { status: 201 })
}
