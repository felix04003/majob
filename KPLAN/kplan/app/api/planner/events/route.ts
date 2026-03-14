import { NextResponse } from "next/server"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { z } from "zod"
import { randomToken } from "@/lib/tokens"

const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().default("other"),
  start_at: z.string(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled", "completed"]).default("draft"),
  invitation_template: z.string().default("elegant-classic"),
})

export async function GET() {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: events, error } = await db
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eventIds = (events ?? []).map((e: any) => e.id).filter(Boolean)
  let accessByEventId = new Map<string, { client_token: string; expires_at: string | null }>()
  if (eventIds.length > 0) {
    const { data: access } = await db
      .from("client_access")
      .select("event_id, client_token, expires_at, created_at")
      .in("event_id", eventIds)
      .order("created_at", { ascending: false })

    ;(access ?? []).forEach((a: any) => {
      if (!accessByEventId.has(a.event_id)) {
        accessByEventId.set(a.event_id, { client_token: a.client_token, expires_at: a.expires_at ?? null })
      }
    })
  }

  const enriched = (events ?? []).map((e: any) => ({
    ...e,
    client_access: accessByEventId.get(e.id) ?? null,
  }))

  return NextResponse.json({ events: enriched })
}

export async function POST(req: Request) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const json = await req.json().catch(() => null)
  const parsed = CreateEventSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.issues }, { status: 400 })
  }

  const db = supabaseAdmin()
  
  const { data: event, error } = await db
    .from("events")
    .insert({
      title: parsed.data.title,
      type: parsed.data.type,
      start_at: parsed.data.start_at,
      venue_name: parsed.data.venue_name,
      venue_address: parsed.data.venue_address,
      status: parsed.data.status,
      invitation_template: parsed.data.invitation_template,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientToken = randomToken()
  await db.from("client_access").insert({
    event_id: event.id,
    client_token: clientToken,
  })

  return NextResponse.json({ event: { ...event, client_access: { client_token: clientToken, expires_at: null } } }, { status: 201 })
}


