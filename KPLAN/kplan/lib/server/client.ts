import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

type ClientSessionResult =
  | { ok: true; eventId: string; userId: string }
  | { ok: false; response: NextResponse }

export async function requireClientSession(eventId: string): Promise<ClientSessionResult> {
  // 1. Check Supabase session cookie
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  // 2. Verify client has access to this specific event
  const db = supabaseAdmin()
  const { data: access, error: dbError } = await db
    .from("client_access")
    .select("event_id, is_revoked")
    .eq("user_id", data.user.id)
    .eq("event_id", eventId)
    .single()

  // Distinguish DB errors from "no row found" (PGRST116 = not found)
  if (dbError && dbError.code !== "PGRST116") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Internal server error" }, { status: 500 }),
    }
  }

  if (!access || access.is_revoked) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    }
  }

  return { ok: true, eventId, userId: data.user.id }
}
