import { createClient } from "@supabase/supabase-js"

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    throw new Error(
      "Supabase env manquante: définis NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local puis redémarre `npm run dev`."
    )
  }
  return createClient(url, service, { auth: { persistSession: false } })
}


