import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export async function requirePlannerSession() {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const allowed = process.env.KPLAN_ADMIN_EMAIL?.trim()
  if (allowed && data.user.email?.toLowerCase() !== allowed.toLowerCase()) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return { ok: true as const, user: data.user }
}


