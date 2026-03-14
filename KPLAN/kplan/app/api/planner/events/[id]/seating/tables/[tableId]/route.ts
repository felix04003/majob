import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

// DELETE handler: Delete a single table
export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string; tableId: string }> }
) {
  try {
    const gate = await requirePlannerSession()
    if (!gate.ok) return gate.response

    const { id, tableId } = await context.params

    // Validate both id and tableId as UUIDs
    const idValidation = z.string().uuid().safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid event ID", issues: idValidation.error.issues },
        { status: 400 }
      )
    }

    const tableIdValidation = z.string().uuid().safeParse(tableId)
    if (!tableIdValidation.success) {
      return NextResponse.json(
        { error: "Invalid table ID", issues: tableIdValidation.error.issues },
        { status: 400 }
      )
    }

    const db = supabaseAdmin()

    // Verify the table belongs to the event
    const { data: table, error: fetchError } = await db
      .from("seating_tables")
      .select("id")
      .eq("id", tableId)
      .eq("event_id", id)
      .single()

    if (fetchError || !table) {
      return NextResponse.json(
        { error: "Table not found or does not belong to this event" },
        { status: 404 }
      )
    }

    // Delete the table (CASCADE will handle assignments)
    const { error: deleteError } = await db
      .from("seating_tables")
      .delete()
      .eq("id", tableId)

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete table", details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/planner/events/[id]/seating/tables/[tableId]]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
