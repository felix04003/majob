import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Query = z.object({ token: z.string().min(10) })

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function toIcsDate(dtIso: string) {
  // Use UTC in ICS: YYYYMMDDTHHMMSSZ
  const d = new Date(dtIso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  )
}

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Missing/invalid token" }, { status: 400 })

  const db = supabaseAdmin()
  const { data: inv, error: ie } = await db
    .from("invitations")
    .select("event_id, guest_id, invite_token")
    .eq("invite_token", parsed.data.token)
    .single()

  if (ie || !inv) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  const { data: event, error: ee } = await db
    .from("events")
    .select("id,title,start_at,venue_name,venue_address")
    .eq("id", inv.event_id)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  // Default duration: 4h
  const dtStart = toIcsDate(event.start_at)
  const dtEnd = toIcsDate(new Date(new Date(event.start_at).getTime() + 4 * 60 * 60 * 1000).toISOString())
  const uid = `${inv.invite_token}@kplan.local`

  const location = [event.venue_name, event.venue_address].filter(Boolean).join(" — ")
  const description = `RSVP: ${new URL(`/i/${inv.invite_token}`, req.url).toString()}`

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kplan//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(uid)}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(event.title)}`,
    location ? `LOCATION:${icsEscape(location)}` : undefined,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename=\"kplan-${event.id}.ics\"`,
    },
  })
}


