import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })
const InviteBody = z.object({ email: z.string().email() })

// GET — list all client accounts for this event
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from("client_access")
    .select("id, email, is_revoked, invited_at, user_id")
    .eq("event_id", parsed.data.id)
    .order("invited_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

// POST — invite a new client by email
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const eventId = parsed.data.id

  const json = await req.json().catch(() => null)
  const body = InviteBody.safeParse(json)
  if (!body.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 })

  const { email } = body.data
  const db = supabaseAdmin()

  // Check if already invited to this event
  const { data: existing } = await db
    .from("client_access")
    .select("id, is_revoked")
    .eq("event_id", eventId)
    .eq("email", email)
    .maybeSingle()

  if (existing && !existing.is_revoked) {
    return NextResponse.json({ error: "Client already has access to this event" }, { status: 409 })
  }

  // Invite via Supabase Auth (sends invitation email with set-password link)
  const { data: inviteData, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/client/set-password`,
  })

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  const userId = inviteData.user?.id

  // Insert or restore client_access row
  if (existing && existing.is_revoked) {
    // Re-activate revoked access
    await db
      .from("client_access")
      .update({ is_revoked: false, invited_at: new Date().toISOString(), user_id: userId })
      .eq("id", existing.id)
  } else {
    await db.from("client_access").insert({
      event_id: eventId,
      email,
      user_id: userId ?? null,
      is_revoked: false,
    })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
