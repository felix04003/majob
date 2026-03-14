import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

// GET handler: Returns all assignments for a specific table
export async function GET(
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
    const { data: table, error: fetchTableError } = await db
      .from("seating_tables")
      .select("id, label, shape, capacity, pos_x, pos_y")
      .eq("id", tableId)
      .eq("event_id", id)
      .single()

    if (fetchTableError || !table) {
      return NextResponse.json(
        { error: "Table not found or does not belong to this event" },
        { status: 404 }
      )
    }

    // Fetch all assignments for this table with guest data
    const { data: assignments, error: assignmentsError } = await db
      .from("seat_assignments")
      .select(
        `
        guest_id,
        seat_number,
        guests (
          id,
          first_name,
          last_name,
          rsvp_status
        )
      `
      )
      .eq("table_id", tableId)

    if (assignmentsError) {
      return NextResponse.json(
        { error: "Failed to fetch assignments", details: assignmentsError.message },
        { status: 500 }
      )
    }

    // Transform assignments to include guest data
    const transformedAssignments = (assignments || []).map((assignment: any) => ({
      guest_id: assignment.guest_id,
      seat_number: assignment.seat_number,
      guest: {
        id: assignment.guests?.id,
        first_name: assignment.guests?.first_name,
        last_name: assignment.guests?.last_name,
        rsvp_status: assignment.guests?.rsvp_status,
      },
    }))

    return NextResponse.json({
      table,
      assignments: transformedAssignments,
    })
  } catch (error) {
    console.error("[GET /api/planner/events/[id]/seating/tables/[tableId]/assignments]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
