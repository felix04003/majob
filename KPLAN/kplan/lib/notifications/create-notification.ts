import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/email/send-email"

export interface CreateNotificationOpts {
  event_id: string
  recipient_type: "planner" | "client"
  type: "task_overdue" | "client_commented" | "client_validated" | "client_refused" | "appointment_reminder" | "task_needs_validation"
  title: string
  message?: string
  related_id?: string
  email?: { to: string; subject: string; html: string }
}

export async function createNotification(opts: CreateNotificationOpts): Promise<{ ok: boolean; id?: string }> {
  try {
    const db = supabaseAdmin()

    // Insert notification into DB
    const { data: notification, error: insertError } = await db
      .from("notifications")
      .insert({
        event_id: opts.event_id,
        recipient_type: opts.recipient_type,
        type: opts.type,
        title: opts.title,
        message: opts.message || null,
        related_id: opts.related_id || null,
        email_sent: false,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (insertError || !notification) {
      console.error("[notification] Failed to insert notification:", insertError?.message || "Unknown error")
      return { ok: false }
    }

    // If email object is provided, send email and update email_sent flag
    if (opts.email) {
      const emailResult = await sendEmail(opts.email)
      if (emailResult.ok) {
        const { error: updateError } = await db
          .from("notifications")
          .update({ email_sent: true })
          .eq("id", notification.id)

        if (updateError) {
          console.error("[notification] Failed to update email_sent flag:", updateError.message)
        }
      } else {
        console.error("[notification] Email failed to send:", emailResult.error)
      }
    }

    return { ok: true, id: notification.id }
  } catch (err) {
    console.error("[notification] Error in createNotification:", err instanceof Error ? err.message : String(err))
    return { ok: false }
  }
}
