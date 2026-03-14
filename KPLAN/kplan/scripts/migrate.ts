#!/usr/bin/env npx tsx
/**
 * Kplan SQL Migration Runner
 *
 * Reads all numbered .sql files from sql/migrations/ in order,
 * checks which ones have already been applied (via the _migrations table),
 * and runs the new ones sequentially.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts            # run pending migrations
 *   npx tsx scripts/migrate.ts --status   # show migration status
 *   npx tsx scripts/migrate.ts --dry-run  # show what would run
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

// Load env
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const MIGRATIONS_DIR = path.resolve(__dirname, "../sql/migrations")
const args = process.argv.slice(2)
const isDryRun = args.includes("--dry-run")
const isStatus = args.includes("--status")

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMigrationFiles(): { name: string; path: string }[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()

  return files.map((f) => ({
    name: f.replace(/\.sql$/, ""),
    path: path.join(MIGRATIONS_DIR, f),
  }))
}

async function ensureTrackerTable() {
  // Create _migrations table if it doesn't exist (migration 000)
  const { error } = await supabase.rpc("exec_sql", {
    sql: `CREATE TABLE IF NOT EXISTS _migrations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );`,
  })

  // If rpc doesn't exist, fall back to direct SQL via REST
  if (error) {
    // The table might already exist; try reading from it
    const { error: readErr } = await supabase.from("_migrations").select("id").limit(1)
    if (readErr) {
      console.error("❌ Cannot create or access _migrations table.")
      console.error("   Please run sql/migrations/000_create_migration_tracker.sql manually in Supabase SQL Editor first.")
      process.exit(1)
    }
  }
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("_migrations")
    .select("name")
    .order("id", { ascending: true })

  if (error) {
    // Table might not exist yet
    return new Set()
  }

  return new Set((data ?? []).map((r: { name: string }) => r.name))
}

async function runSQL(sql: string): Promise<void> {
  // Use Supabase rpc if available, otherwise try direct
  const { error } = await supabase.rpc("exec_sql", { sql })
  if (error) {
    throw new Error(`SQL execution failed: ${error.message}`)
  }
}

async function recordMigration(name: string): Promise<void> {
  const { error } = await supabase.from("_migrations").insert({ name })
  if (error) throw new Error(`Failed to record migration: ${error.message}`)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const files = getMigrationFiles()

  if (files.length === 0) {
    console.log("📭 No migration files found in sql/migrations/")
    return
  }

  await ensureTrackerTable()
  const applied = await getAppliedMigrations()

  // ── Status mode ───────────────────────────────────────────────────────
  if (isStatus) {
    console.log("\n📋 Migration Status\n")
    console.log("  Status    │ Migration")
    console.log("  ──────────┼──────────────────────────────────────────")
    for (const f of files) {
      const status = applied.has(f.name) ? "✅ applied" : "⏳ pending"
      console.log(`  ${status} │ ${f.name}`)
    }
    console.log()
    const pending = files.filter((f) => !applied.has(f.name))
    console.log(`  Total: ${files.length} | Applied: ${applied.size} | Pending: ${pending.length}\n`)
    return
  }

  // ── Run / dry-run ─────────────────────────────────────────────────────
  const pending = files.filter((f) => !applied.has(f.name))

  if (pending.length === 0) {
    console.log("✅ All migrations are up to date.")
    return
  }

  console.log(`\n🚀 ${pending.length} pending migration(s)${isDryRun ? " (DRY RUN)" : ""}:\n`)

  for (const migration of pending) {
    console.log(`  → ${migration.name}`)

    if (!isDryRun) {
      const sql = fs.readFileSync(migration.path, "utf-8")

      try {
        await runSQL(sql)
        await recordMigration(migration.name)
        console.log(`    ✅ Applied`)
      } catch (err: any) {
        console.error(`    ❌ Failed: ${err.message}`)
        console.error(`\n⛔ Migration stopped. Fix the issue and re-run.`)
        process.exit(1)
      }
    }
  }

  if (isDryRun) {
    console.log("\n📝 Dry run complete. No changes were made.\n")
  } else {
    console.log(`\n✅ All ${pending.length} migration(s) applied successfully.\n`)
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
