import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()

  const [{ data: guests, error: ge }, { data: invs, error: ie }, { data: passes, error: pe }] = await Promise.all([
    db
      .from("guests")
      .select("id,first_name,last_name,email,phone,rsvp_status,created_at,deleted_at")
      .eq("event_id", parsed.data.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    db
      .from("invitations")
      .select("guest_id,invite_token,status,channel,sent_at,created_at")
      .eq("event_id", parsed.data.id)
      .order("created_at", { ascending: false }),
    db.from("qr_passes").select("id,guest_id,qr_token,is_active,revoked_at").eq("event_id", parsed.data.id),
  ])

  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 })

  const inviteByGuest = new Map<
    string,
    { invite_token: string; status: string; channel: string | null; sent_at: string | null }
  >()
  ;(invs ?? []).forEach((i: any) => {
    if (!inviteByGuest.has(i.guest_id))
      inviteByGuest.set(i.guest_id, {
        invite_token: i.invite_token,
        status: i.status,
        channel: i.channel ?? null,
        sent_at: i.sent_at ?? null,
      })
  })

  const passByGuest = new Map<string, { id: string; qr_token: string; is_active: boolean; revoked_at: string | null }>()
  ;(passes ?? []).forEach((p: any) => {
    passByGuest.set(p.guest_id, { id: p.id, qr_token: p.qr_token, is_active: p.is_active, revoked_at: p.revoked_at ?? null })
  })

  const rows = (guests ?? []).map((g: any) => ({
    ...g,
    invitation: inviteByGuest.get(g.id) ?? null,
    qr: passByGuest.get(g.id) ?? null,
  }))

  return NextResponse.json({ guests: rows })
}


