import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ token: z.string().min(10) })
const Body = z.object({
  channel: z.enum(["sms", "whatsapp", "email", "manual"]).default("manual"),
})

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const rawParams = await context.params
  const parsedParams = Params.safeParse(rawParams)
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 })

  const json = await req.json().catch(() => ({}))
  const parsedBody = Body.safeParse(json)
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const db = supabaseAdmin()
  const now = new Date().toISOString()

  const { data: inv, error: ie } = await db
    .from("invitations")
    .update({
      sent_at: now,
      channel: parsedBody.data.channel,
      status: "sent",
    })
    .eq("invite_token", parsedParams.data.token)
    .select("*")
    .single()

  if (ie || !inv) return NextResponse.json({ error: ie?.message ?? "Invitation not found" }, { status: 404 })
  return NextResponse.json({ invitation: inv })
}


