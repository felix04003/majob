import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

type ClientAccessResult =
  | { ok: true; eventId: string }
  | { ok: false; response: NextResponse }

export async function requireClientAccess(token: string): Promise<ClientAccessResult> {
  if (!token || token.length < 10) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing/invalid token" }, { status: 400 }),
    }
  }

  const db = supabaseAdmin()
  const { data: access } = await db
    .from("client_access")
    .select("event_id, expires_at")
    .eq("client_token", token)
    .single()

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    }
  }

  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Token expired" }, { status: 401 }),
    }
  }

  return { ok: true, eventId: access.event_id }
}
