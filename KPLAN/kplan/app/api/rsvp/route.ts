import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Body = z.object({
  inviteToken: z.string().min(10),
  rsvp: z.enum(["yes", "no", "maybe"]),
  allergies: z.string().optional().nullable(),
  personalMessage: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Missing/invalid data" }, { status: 400 })

  const db = supabaseAdmin()
  const { data: inv, error: ie } = await db
    .from("invitations")
    .select("guest_id, event_id")
    .eq("invite_token", parsed.data.inviteToken)
    .single()

  if (ie || !inv) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  const updates: any = {
    rsvp_status: parsed.data.rsvp,
    rsvp_updated_at: new Date().toISOString(),
  }

  if (parsed.data.allergies !== undefined) {
    updates.allergies = parsed.data.allergies
  }

  if (parsed.data.personalMessage !== undefined) {
    updates.notes = parsed.data.personalMessage
  }

  const { error: ge } = await db
    .from("guests")
    .update(updates)
    .eq("id", inv.guest_id)

  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })

  let passGenerated = false

  // Generate QR pass if RSVP is "yes"
  if (parsed.data.rsvp === "yes") {
    // Check if guest already has a QR pass for this event
    const { data: existingPass, error: checkError } = await db
      .from("qr_passes")
      .select("id")
      .eq("event_id", inv.event_id)
      .eq("guest_id", inv.guest_id)
      .single()

    // If no pass exists, create one
    if (!existingPass && !checkError) {
      const { error: passError } = await db
        .from("qr_passes")
        .insert({
          event_id: inv.event_id,
          guest_id: inv.guest_id,
          qr_token: crypto.randomUUID(),
          is_active: true,
          issued_at: new Date().toISOString(),
        })

      if (!passError) {
        passGenerated = true
      }
    }
  }

  return NextResponse.json({ ok: true, passGenerated })
}


