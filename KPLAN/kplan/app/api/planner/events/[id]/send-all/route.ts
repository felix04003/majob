import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/email/send-email"
import { buildInvitationEmailHtml, buildInvitationEmailSubject } from "@/lib/email/invitation-email"

const Params = z.object({ id: z.string().uuid() })
const Body = z.object({
  channel: z.enum(["email", "whatsapp"]),
  baseUrl: z.string().url(),
})

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const json = await req.json().catch(() => null)
  const parsedBody = Body.safeParse(json)
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid body", details: parsedBody.error.issues }, { status: 400 })

  const db = supabaseAdmin()
  const eventId = parsed.data.id
  const { channel, baseUrl } = parsedBody.data

  // Fetch event
  const { data: event, error: ee } = await db
    .from("events")
    .select("id, title, start_at, venue_name, venue_address, invitation_template, invitation_custom")
    .eq("id", eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  // Fetch all unsent invitations for this event
  const { data: invitations, error: ie } = await db
    .from("invitations")
    .select("id, guest_id, invite_token")
    .eq("event_id", eventId)
    .is("sent_at", null)

  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (!invitations || invitations.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 0, errors: [], message: "Toutes les invitations ont déjà été envoyées" })
  }

  // Fetch all guests for these invitations
  const guestIds = invitations.map((i) => i.guest_id)
  const { data: guests, error: ge } = await db
    .from("guests")
    .select("id, first_name, last_name, email, phone")
    .in("id", guestIds)
    .is("deleted_at", null)

  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })

  const guestMap = new Map((guests ?? []).map((g: any) => [g.id, g]))

  let sent = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []
  const whatsappUrls: { name: string; url: string }[] = []

  const subject = buildInvitationEmailSubject(event.title)

  for (const inv of invitations) {
    const guest = guestMap.get(inv.guest_id)
    if (!guest) {
      skipped++
      continue
    }

    const inviteUrl = `${baseUrl}/i/${inv.invite_token}`

    if (channel === "email") {
      if (!guest.email) {
        skipped++
        continue
      }

      const html = buildInvitationEmailHtml({
        guestFirstName: guest.first_name,
        guestLastName: guest.last_name,
        eventTitle: event.title,
        eventDate: event.start_at,
        venueName: event.venue_name,
        venueAddress: event.venue_address,
        inviteUrl,
        templateId: event.invitation_template,
        customMessage: (event.invitation_custom as any)?.message || null,
      })

      const result = await sendEmail({ to: guest.email, subject, html })

      if (result.ok) {
        await db
          .from("invitations")
          .update({ sent_at: new Date().toISOString(), channel: "email", status: "sent" })
          .eq("id", inv.id)
        sent++
      } else {
        failed++
        errors.push(`${guest.first_name} ${guest.last_name}: ${result.error}`)
      }
    }

    if (channel === "whatsapp") {
      if (!guest.phone) {
        skipped++
        continue
      }

      const cleanPhone = guest.phone.replace(/[\s\-()]/g, "")
      const date = new Date(event.start_at).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

      const message = [
        `✉️ *Invitation — ${event.title}*`,
        "",
        `Cher(ère) ${guest.first_name},`,
        "",
        `Vous êtes invité(e) à *${event.title}*`,
        `📅 ${date}`,
        event.venue_name ? `📍 ${event.venue_name}` : null,
        "",
        `Confirmez votre présence ici :`,
        inviteUrl,
      ]
        .filter(Boolean)
        .join("\n")

      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      whatsappUrls.push({ name: `${guest.first_name} ${guest.last_name}`, url: whatsappUrl })

      await db
        .from("invitations")
        .update({ sent_at: new Date().toISOString(), channel: "whatsapp", status: "sent" })
        .eq("id", inv.id)
      sent++
    }
  }

  return NextResponse.json({
    sent,
    failed,
    skipped,
    errors,
    whatsappUrls: channel === "whatsapp" ? whatsappUrls : undefined,
  })
}
