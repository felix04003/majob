import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { randomToken } from "@/lib/tokens"

const Params = z.object({ id: z.string().uuid() })

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()
  const eventId = parsed.data.id

  // Fetch event pour récupérer start_at (sert d'expiration au nouveau token)
  const { data: event, error: eventErr } = await db
    .from("events")
    .select("start_at")
    .eq("id", eventId)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  // Expire les tokens précédents sans expires_at
  const { data: prev } = await db
    .from("client_access")
    .select("id, expires_at")
    .eq("event_id", eventId)
    .is("expires_at", null)
    .order("created_at", { ascending: false })

  if (prev && prev.length > 0) {
    await db
      .from("client_access")
      .update({ expires_at: new Date().toISOString() })
      .in("id", prev.map((p: any) => p.id))
  }

  const clientToken = randomToken(24)
  const { data: access, error: ae } = await db
    .from("client_access")
    .insert({
      event_id: eventId,
      client_token: clientToken,
      expires_at: event.start_at, // ← expire à la date de l'événement
    })
    .select("*")
    .single()

  if (ae || !access) {
    return NextResponse.json({ error: ae?.message ?? "Create client access failed" }, { status: 500 })
  }

  return NextResponse.json({ clientAccess: access })
}
