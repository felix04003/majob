import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requirePlannerSession } from "@/lib/server/planner"

const Body = z.object({ comment: z.string().min(2).max(500) })

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const { id } = await context.params

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Comment required" }, { status: 400 })

  const db = supabaseAdmin()
  const { error } = await db
    .from("guest_changes")
    .update({
      status: "rejected",
      reviewed_by: "planner",
      reviewed_at: new Date().toISOString(),
      comment: parsed.data.comment,
    })
    .eq("id", id)
    .eq("status", "pending")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}


