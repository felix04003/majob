import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

// GET handler: Returns all seating data for an event
export async function GET(
  _: Request,
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

    const db = supabaseAdmin()

    // Fetch all seating tables for this event
    const { data: tables, error: tablesError } = await db
      .from("seating_tables")
      .select("id, label, shape, capacity, pos_x, pos_y, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true })

    if (tablesError) {
      return NextResponse.json(
        { error: "Failed to fetch tables", details: tablesError.message },
        { status: 500 }
      )
    }

    // Fetch all seat assignments for tables in this event
    const { data: assignments, error: assignmentsError } = await db
      .from("seat_assignments")
      .select(
        `
        guest_id,
        table_id,
        seat_number,
        guests (
          first_name,
          last_name,
          rsvp_status
        )
      `
      )
      .in(
        "table_id",
        tables?.map((t) => t.id) || []
      )

    if (assignmentsError) {
      return NextResponse.json(
        { error: "Failed to fetch assignments", details: assignmentsError.message },
        { status: 500 }
      )
    }

    // Transform assignments to include guest data
    const transformedAssignments = (assignments || []).map((assignment: any) => ({
      guest_id: assignment.guest_id,
      table_id: assignment.table_id,
      seat_number: assignment.seat_number,
      guest: {
        first_name: assignment.guests?.first_name,
        last_name: assignment.guests?.last_name,
        rsvp_status: assignment.guests?.rsvp_status,
      },
    }))

    // Fetch all guests with rsvp_status = 'yes' and deleted_at IS NULL
    const { data: allYesGuests, error: guestsError } = await db
      .from("guests")
      .select("id")
      .eq("event_id", id)
      .eq("rsvp_status", "yes")
      .is("deleted_at", null)

    if (guestsError) {
      return NextResponse.json(
        { error: "Failed to fetch guests", details: guestsError.message },
        { status: 500 }
      )
    }

    // Compute unassigned guests
    const assignedGuestIds = new Set(transformedAssignments.map((a: any) => a.guest_id))
    const unassignedGuests = (allYesGuests || [])
      .filter((guest: any) => !assignedGuestIds.has(guest.id))
      .map((guest: any) => guest.id)

    return NextResponse.json({
      tables: tables || [],
      assignments: transformedAssignments,
      unassignedGuests,
    })
  } catch (error) {
    console.error("[GET /api/planner/events/[id]/seating]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PUT handler: Saves all tables + assignments at once
export async function PUT(
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
      tables: z.array(
        z.object({
          id: z.string().uuid().optional(),
          label: z.string().min(1).max(100),
          shape: z.enum(["round", "rectangle", "long"]),
          capacity: z.number().int().min(1).max(50),
          pos_x: z.number().min(0).max(100),
          pos_y: z.number().min(0).max(100),
        })
      ),
      assignments: z.array(
        z.object({
          table_id: z.string().uuid(),
          guest_id: z.string().uuid(),
          seat_number: z.number().int().nullish(),
        })
      ),
    })

    const bodyValidation = bodySchema.safeParse(body)
    if (!bodyValidation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: bodyValidation.error.issues },
        { status: 400 }
      )
    }

    const { tables, assignments } = bodyValidation.data
    const db = supabaseAdmin()

    // Delete all existing seating tables for this event (CASCADE deletes assignments)
    const { error: deleteError } = await db
      .from("seating_tables")
      .delete()
      .eq("event_id", id)

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete existing tables", details: deleteError.message },
        { status: 500 }
      )
    }

    // Prepare tables for insertion
    const tablesToInsert = tables.map((table) => ({
      id: table.id || crypto.randomUUID(),
      event_id: id,
      label: table.label,
      shape: table.shape,
      capacity: table.capacity,
      pos_x: table.pos_x,
      pos_y: table.pos_y,
    }))

    // Insert all tables
    const { data: insertedTables, error: insertTablesError } = await db
      .from("seating_tables")
      .insert(tablesToInsert)
      .select("id")

    if (insertTablesError) {
      return NextResponse.json(
        { error: "Failed to insert tables", details: insertTablesError.message },
        { status: 500 }
      )
    }

    // Create a mapping of old table IDs to new table IDs
    const tableIdMap = new Map<string, string>()
    tables.forEach((table, index) => {
      const newId = table.id || insertedTables?.[index]?.id
      if (table.id) {
        tableIdMap.set(table.id, table.id)
      } else if (newId) {
        tableIdMap.set(`temp-${index}`, newId)
      }
    })

    // Prepare assignments for insertion
    const assignmentsToInsert = assignments.map((assignment) => ({
      table_id: assignment.table_id,
      guest_id: assignment.guest_id,
      seat_number: assignment.seat_number || null,
    }))

    // Insert all assignments
    let assignmentCount = 0
    if (assignmentsToInsert.length > 0) {
      const { error: insertAssignmentsError } = await db
        .from("seat_assignments")
        .insert(assignmentsToInsert)

      if (insertAssignmentsError) {
        return NextResponse.json(
          { error: "Failed to insert assignments", details: insertAssignmentsError.message },
          { status: 500 }
        )
      }
      assignmentCount = assignmentsToInsert.length
    }

    return NextResponse.json({
      ok: true,
      tables: insertedTables?.length || 0,
      assignments: assignmentCount,
    })
  } catch (error) {
    console.error("[PUT /api/planner/events/[id]/seating]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
