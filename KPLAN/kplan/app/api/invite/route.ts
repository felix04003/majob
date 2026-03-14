import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Query = z.object({ token: z.string().min(10) })

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Missing/invalid token" }, { status: 400 })

  const db = supabaseAdmin()

  const { data: inv, error: ie } = await db
    .from("invitations")
    .select("event_id, guest_id, invite_token, status, sent_at")
    .eq("invite_token", parsed.data.token)
    .single()

  if (ie || !inv) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  const [{ data: event, error: ee }, { data: guest, error: ge }, { data: pass }] = await Promise.all([
    db.from("events").select("id,title,start_at,venue_name,venue_address,status,invitation_template,invitation_custom,invitation_image_url").eq("id", inv.event_id).single(),
    db
      .from("guests")
      .select("id,first_name,last_name,rsvp_status,rsvp_updated_at,plus_one_count,allergies,notes,deleted_at")
      .eq("id", inv.guest_id)
      .single(),
    db.from("qr_passes").select("qr_token,is_active,revoked_at").eq("guest_id", inv.guest_id).maybeSingle(),
  ])

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (ge || !guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 })
  if (guest.deleted_at) return NextResponse.json({ error: "Guest deleted" }, { status: 410 })

  return NextResponse.json({
    event,
    guest,
    invitation: {
      invite_token: inv.invite_token,
      status: inv.status,
      sent_at: inv.sent_at,
    },
    qr: pass
      ? { qr_token: pass.qr_token, is_active: pass.is_active, revoked_at: pass.revoked_at }
      : { qr_token: null, is_active: false, revoked_at: null },
  })
}


