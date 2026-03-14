#!/usr/bin/env npx tsx
/**
 * Kplan Environment Checker
 *
 * Validates that all required environment variables are present
 * and properly formatted. Run before first deploy or after cloning.
 *
 * Usage:
 *   npx tsx scripts/check-env.ts
 */

import fs from "fs"
import path from "path"
import dotenv from "dotenv"

const ENV_FILE = path.resolve(__dirname, "../.env.local")
const ENV_EXAMPLE = path.resolve(__dirname, "../env.example")

console.log("\n🔍 Kplan Environment Check\n")

// ── Check .env.local exists ─────────────────────────────────────────────────

if (!fs.existsSync(ENV_FILE)) {
  console.error("❌ .env.local not found!")
  console.error(`   → Copy the example: cp env.example .env.local`)
  console.error(`   → Then fill in your Supabase credentials.\n`)
  process.exit(1)
}

console.log("✅ .env.local found\n")

// ── Load and validate ───────────────────────────────────────────────────────

dotenv.config({ path: ENV_FILE })

type Check = {
  key: string
  required: boolean
  validate?: (val: string) => string | null // returns error message or null
}

const checks: Check[] = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    validate: (v) =>
      v.startsWith("https://") && v.includes("supabase")
        ? null
        : "Should be a Supabase URL like https://xxx.supabase.co",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    validate: (v) =>
      v.length > 30 ? null : "Anon key seems too short (expected JWT)",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    validate: (v) =>
      v.length > 30 ? null : "Service role key seems too short (expected JWT)",
  },
  {
    key: "RESEND_API_KEY",
    required: false,
    validate: (v) =>
      v.startsWith("re_") ? null : "Resend API keys start with 're_'",
  },
  {
    key: "KPLAN_FROM_EMAIL",
    required: false,
    validate: (v) =>
      v.includes("@") || v.includes("<") ? null : "Should be an email or 'Name <email>' format",
  },
  {
    key: "KPLAN_ADMIN_EMAIL",
    required: false,
    validate: (v) =>
      v.includes("@") ? null : "Should be a valid email address",
  },
]

let errors = 0
let warnings = 0

for (const check of checks) {
  const val = process.env[check.key]?.trim()

  if (!val || val === "") {
    if (check.required) {
      console.error(`  ❌ ${check.key} — MISSING (required)`)
      errors++
    } else {
      console.warn(`  ⚠️  ${check.key} — not set (optional)`)
      warnings++
    }
    continue
  }

  // Check for placeholder values
  if (
    val.includes("your-") ||
    val.includes("xxx") ||
    val === "placeholder"
  ) {
    console.error(`  ❌ ${check.key} — still has placeholder value`)
    errors++
    continue
  }

  // Run custom validation
  if (check.validate) {
    const err = check.validate(val)
    if (err) {
      console.error(`  ❌ ${check.key} — ${err}`)
      errors++
      continue
    }
  }

  console.log(`  ✅ ${check.key}`)
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log("")
if (errors > 0) {
  console.error(`\n❌ ${errors} error(s) found. Fix them in .env.local before running the app.\n`)
  process.exit(1)
} else if (warnings > 0) {
  console.warn(`\n⚠️  All required vars OK, but ${warnings} optional var(s) not set.\n`)
} else {
  console.log(`\n✅ All environment variables are properly configured!\n`)
}
