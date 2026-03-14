import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

// POST handler: Create a single table
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requirePlannerSession()
    if (!gate.ok) return gate.response

    const { id } = await context.params

    // Validate id as UUID
    const idValidation = z.string().uuid().safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid event ID", issues: idValidation.error.issues },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validate request body
    const bodySchema = z.object({
      label: z.string().min(1).max(100),
      shape: z.enum(["round", "rectangle", "long"]),
      capacity: z.number().int().min(1).max(50),
      pos_x: z.number().min(0).max(100),
      pos_y: z.number().min(0).max(100),
    })

    const bodyValidation = bodySchema.safeParse(body)
    if (!bodyValidation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: bodyValidation.error.issues },
        { status: 400 }
      )
    }

    const { label, shape, capacity, pos_x, pos_y } = bodyValidation.data
    const db = supabaseAdmin()

    // Create new table with generated UUID
    const tableId = crypto.randomUUID()
    const { data: newTable, error: insertError } = await db
      .from("seating_tables")
      .insert([
        {
          id: tableId,
          event_id: id,
          label,
          shape,
          capacity,
          pos_x,
          pos_y,
        },
      ])
      .select()

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create table", details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(newTable?.[0], { status: 201 })
  } catch (error) {
    console.error("[POST /api/planner/events/[id]/seating/tables]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
