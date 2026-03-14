import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { randomToken } from "@/lib/tokens"

function dbInitHint(errMsg?: string) {
  const msg = errMsg ?? ""
  const looksLikeMissingTable =
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg) ||
    /schema cache/i.test(msg)
  if (!looksLikeMissingTable) return null
  return "Base non initialisée: exécute `sql/schema.sql` dans Supabase (SQL Editor), puis recharge le schema API (Settings → API → Reload) ou attends ~30s."
}

const Body = z.object({
  title: z.string().min(2).max(120).default("Démo Kplan"),
  startAt: z.string().datetime().optional(),
  guestsCount: z.number().int().min(0).max(50).default(8),
})

export async function POST(req: Request) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const json = await req.json().catch(() => ({}))
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const db = supabaseAdmin()
  const startAt = parsed.data.startAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: event, error: ee } = await db
    .from("events")
    .insert({
      title: parsed.data.title,
      type: "other",
      start_at: startAt,
      status: "draft",
    })
    .select("*")
    .single()

  if (ee || !event) {
    const hint = dbInitHint(ee?.message)
    return NextResponse.json(
      { error: ee?.message ?? "Create event failed", hint },
      { status: 500 }
    )
  }

  const clientToken = randomToken(24)
  const { data: access, error: ae } = await db
    .from("client_access")
    .insert({
      event_id: event.id,
      client_token: clientToken,
      expires_at: null,
    })
    .select("*")
    .single()

  if (ae || !access) {
    const hint = dbInitHint(ae?.message)
    return NextResponse.json(
      { error: ae?.message ?? "Create client access failed", hint },
      { status: 500 }
    )
  }

  const guests: any[] = []
  const invitations: any[] = []
  const passes: any[] = []

  for (let i = 1; i <= parsed.data.guestsCount; i++) {
    const { data: g, error: ge } = await db
      .from("guests")
      .insert({
        event_id: event.id,
        first_name: `Invité`,
        last_name: `#${i}`,
        email: null,
        phone: null,
        category: "demo",
        rsvp_status: "pending",
        plus_one_count: 0,
      })
      .select("*")
      .single()

    if (ge || !g) return NextResponse.json({ error: ge?.message ?? "Create guest failed" }, { status: 500 })
    guests.push(g)

    const inviteToken = randomToken(24)
    const { data: inv, error: ie } = await db
      .from("invitations")
      .insert({
        event_id: event.id,
        guest_id: g.id,
        invite_token: inviteToken,
        status: "created",
        channel: "demo",
      })
      .select("*")
      .single()

    if (ie || !inv) return NextResponse.json({ error: ie?.message ?? "Create invitation failed" }, { status: 500 })
    invitations.push(inv)

    const qrToken = randomToken(24)
    const { data: pass, error: pe } = await db
      .from("qr_passes")
      .insert({
        event_id: event.id,
        guest_id: g.id,
        qr_token: qrToken,
        is_active: true,
      })
      .select("*")
      .single()

    if (pe || !pass) return NextResponse.json({ error: pe?.message ?? "Create qr pass failed" }, { status: 500 })
    passes.push(pass)
  }

  return NextResponse.json({
    event,
    clientAccess: access,
    guests,
    invitations,
    qrPasses: passes,
    links: {
      clientGuestsPath: `/c/${clientToken}/guests`,
      dayofPath: `/dayof`,
    },
  })
}


