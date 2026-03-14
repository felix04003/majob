import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications/create-notification"
import { requireClientSession } from "@/lib/server/client"

const BodySchema = z.object({
  approved: z.boolean(),
  comment: z.string().nullish(),
})

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params
  const eventId = new URL(req.url).searchParams.get("eventId") ?? ""
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const db = supabaseAdmin()

  // Verify task belongs to client's event
  const { data: task, error: te } = await db
    .from("tasks")
    .select("id, event_id, title, requires_client_validation")
    .eq("id", taskId)
    .eq("event_id", gate.eventId)
    .single()

  if (te || !task)
    return NextResponse.json(
      { error: "Task not found or unauthorized" },
      { status: 404 },
    )

  // Verify task requires client validation
  if (!task.requires_client_validation)
    return NextResponse.json(
      { error: "Task does not require client validation" },
      { status: 400 },
    )

  // Map approved boolean to status string
  const validationStatus = parsed.data.approved ? "validated" : "refused"
  const clientComment = parsed.data.comment ?? null

  // Check if validation record exists
  const { data: existingValidation, error: evError } = await db
    .from("task_validations")
    .select("id")
    .eq("task_id", taskId)
    .single()

  if (evError && evError.code !== "PGRST116") {
    return NextResponse.json({ error: evError.message }, { status: 500 })
  }

  const now = new Date().toISOString()
  let validation

  if (existingValidation) {
    const { data: updated, error: updateError } = await db
      .from("task_validations")
      .update({
        status: validationStatus,
        client_comment: clientComment,
        validated_at: now,
      })
      .eq("id", existingValidation.id)
      .select("*")
      .single()

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || "Failed to update validation" },
        { status: 500 },
      )
    }
    validation = updated
  } else {
    const { data: created, error: createError } = await db
      .from("task_validations")
      .insert({
        task_id: taskId,
        event_id: gate.eventId,
        status: validationStatus,
        client_comment: clientComment,
        validated_at: now,
        created_at: now,
      })
      .select("*")
      .single()

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message || "Failed to create validation" },
        { status: 500 },
      )
    }
    validation = created
  }

  // Create notification for planner
  const notificationType =
    validationStatus === "validated" ? "client_validated" : "client_refused"
  const notificationTitle =
    validationStatus === "validated"
      ? "Tâche validée par le client"
      : "Tâche refusée par le client"

  await createNotification({
    event_id: gate.eventId,
    recipient_type: "planner",
    type: notificationType,
    title: notificationTitle,
    message:
      validationStatus === "validated"
        ? `Le client a validé la tâche: "${task.title}"`
        : `Le client a refusé la tâche: "${task.title}"${clientComment ? ` - Raison: ${clientComment}` : ""}`,
    related_id: taskId,
  })

  return NextResponse.json({ validation }, { status: 200 })
}
