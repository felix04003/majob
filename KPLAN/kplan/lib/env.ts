/**
 * Runtime environment validation for Kplan.
 *
 * Import this at the top of your root layout or in API routes
 * to get early, clear error messages when env vars are missing.
 */

function required(key: string): string {
  const val = process.env[key]
  if (!val || val.trim() === "") {
    throw new Error(
      `❌ Missing required environment variable: ${key}\n` +
        `   → Copy env.example to .env.local and fill in the values.\n` +
        `   → See README.md for setup instructions.`
    )
  }
  return val.trim()
}

function optional(key: string, fallback = ""): string {
  return process.env[key]?.trim() ?? fallback
}

/** Validated environment — import and use these instead of raw process.env */
export const env = {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Email (Resend)
  RESEND_API_KEY: optional("RESEND_API_KEY"),
  KPLAN_FROM_EMAIL: optional("KPLAN_FROM_EMAIL", "Kplan <noreply@kplan.app>"),

  // App
  KPLAN_ADMIN_EMAIL: optional("KPLAN_ADMIN_EMAIL"),

  // Helpers
  get isProduction() {
    return process.env.NODE_ENV === "production"
  },
  get isDevelopment() {
    return process.env.NODE_ENV === "development"
  },
} as const
