import { NextRequest, NextResponse } from "next/server"
import { applyGuestChange } from "@/lib/workflow/applyGuestChange"
import { requirePlannerSession } from "@/lib/server/planner"

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const { id } = await context.params

  try {
    const result = await applyGuestChange(id, "planner")
    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}


