import { supabaseAdmin } from "@/lib/supabase/admin"
import { randomToken } from "@/lib/tokens"

type ChangeAction = "create" | "update" | "delete"

function assertString(v: unknown, field: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`)
  return v.trim()
}

export async function applyGuestChange(changeId: string, reviewedBy = "planner") {
  const db = supabaseAdmin()

  const { data: change, error: ce } = await db
    .from("guest_changes")
    .select("*")
    .eq("id", changeId)
    .single()

  if (ce || !change) throw new Error(ce?.message || "Change not found")
  if (change.status !== "pending") throw new Error("Change not pending")

  const action = change.action as ChangeAction
  const eventId = change.event_id as string
  const guestId = (change.guest_id as string | null) ?? null
  const payload = (change.payload ?? {}) as Record<string, unknown>

  let finalGuestId: string | null = guestId

  if (action === "create") {
    const first_name = assertString(payload.first_name, "payload.first_name")
    const last_name = assertString(payload.last_name, "payload.last_name")

    const { data: ins, error: ie } = await db
      .from("guests")
      .insert({
        event_id: eventId,
        first_name,
        last_name,
        phone: typeof payload.phone === "string" ? payload.phone : null,
        email: typeof payload.email === "string" ? payload.email : null,
        category: typeof payload.category === "string" ? payload.category : "other",
        plus_one_count: typeof payload.plus_one_count === "number" ? payload.plus_one_count : 0,
        allergies: typeof payload.allergies === "string" ? payload.allergies : null,
        notes: typeof payload.notes === "string" ? payload.notes : null,
      })
      .select("id")
      .single()

    if (ie || !ins) throw new Error(ie?.message || "Insert guest failed")
    finalGuestId = ins.id
  }

  if (action === "update") {
    if (!guestId) throw new Error("Missing guest_id for update")

    // Guard: guest must belong to same event
    const { data: g } = await db.from("guests").select("id,event_id").eq("id", guestId).maybeSingle()
    if (!g) throw new Error("Guest not found")
    if (g.event_id !== eventId) throw new Error("Guest does not belong to event")

    const { error: ue } = await db
      .from("guests")
      .update({
        first_name: typeof payload.first_name === "string" ? payload.first_name : undefined,
        last_name: typeof payload.last_name === "string" ? payload.last_name : undefined,
        phone: typeof payload.phone === "string" ? payload.phone : null,
        email: typeof payload.email === "string" ? payload.email : null,
        category: typeof payload.category === "string" ? payload.category : "other",
        plus_one_count: typeof payload.plus_one_count === "number" ? payload.plus_one_count : 0,
        allergies: typeof payload.allergies === "string" ? payload.allergies : null,
        notes: typeof payload.notes === "string" ? payload.notes : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guestId)

    if (ue) throw new Error(ue.message)
  }

  if (action === "delete") {
    if (!guestId) throw new Error("Missing guest_id for delete")

    // Guard: guest must belong to same event
    const { data: g } = await db.from("guests").select("id,event_id").eq("id", guestId).maybeSingle()
    if (!g) throw new Error("Guest not found")
    if (g.event_id !== eventId) throw new Error("Guest does not belong to event")

    const { error: de } = await db.from("guests").update({ deleted_at: new Date().toISOString() }).eq("id", guestId)
    if (de) throw new Error(de.message)

    await db
      .from("qr_passes")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("guest_id", guestId)
  }

  const { error: ae } = await db
    .from("guest_changes")
    .update({
      status: "approved",
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      guest_id: finalGuestId ?? guestId,
    })
    .eq("id", changeId)

  if (ae) throw new Error(ae.message)

  if (finalGuestId && action !== "delete") {
    const { data: inv } = await db.from("invitations").select("id").eq("guest_id", finalGuestId).maybeSingle()
    if (!inv) {
      await db.from("invitations").insert({
        event_id: eventId,
        guest_id: finalGuestId,
        invite_token: randomToken(24),
        status: "created",
      })
    }

    const { data: pass } = await db.from("qr_passes").select("id, is_active").eq("guest_id", finalGuestId).maybeSingle()
    if (!pass) {
      await db.from("qr_passes").insert({
        event_id: eventId,
        guest_id: finalGuestId,
        qr_token: randomToken(24),
        is_active: true,
      })
    } else if (pass.is_active === false) {
      await db.from("qr_passes").update({ is_active: true, revoked_at: null }).eq("guest_id", finalGuestId)
    }
  }

  return { ok: true, guestId: finalGuestId }
}


