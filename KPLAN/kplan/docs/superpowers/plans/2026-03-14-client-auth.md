# Client Email/Password Authentication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the token-URL client access system with email/password authentication using Supabase Auth, supporting 1 client account → N events, planner invite/revoke, and client self-serve password reset.

**Architecture:** Planner invites clients via `supabaseAdmin.auth.admin.inviteUserByEmail()`, which sends an email with a magic link to `/client/set-password`. Clients authenticate with email+password thereafter; sessions are validated server-side via `requireClientSession(eventId)` which reads the Supabase cookie session and checks the `client_access` pivot table.

**Tech Stack:** Next.js App Router, Supabase Auth (email/password + inviteUserByEmail), `@supabase/ssr` for session cookies, Vitest for unit tests.

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `sql/migrations/007_client-auth.sql` | Alter `client_access`: add `user_id`, `email`, `is_revoked`, `invited_at`; drop `client_token`, `expires_at` |
| `lib/server/client.ts` | **Replace** `requireClientAccess` with `requireClientSession(eventId)` |
| `app/api/client/[eventId]/event/route.ts` | GET event info (session auth) |
| `app/api/client/[eventId]/tasks/route.ts` | GET tasks list |
| `app/api/client/[eventId]/tasks/[taskId]/comments/route.ts` | GET/POST task comments |
| `app/api/client/[eventId]/tasks/[taskId]/validate/route.ts` | POST task validation |
| `app/api/client/[eventId]/guests/route.ts` | GET guests |
| `app/api/client/[eventId]/changes/route.ts` | GET guest changes log |
| `app/api/client/[eventId]/guest-change/route.ts` | POST submit guest change |
| `app/api/client/[eventId]/appointments/route.ts` | GET appointments |
| `app/api/planner/events/[id]/client-accounts/route.ts` | GET list + POST invite client |
| `app/api/planner/events/[id]/client-accounts/[uid]/route.ts` | DELETE revoke access |
| `app/client/layout.tsx` | Minimal layout for `/client/*` pages |
| `app/client/login/page.tsx` | Email+password login form |
| `app/client/forgot-password/page.tsx` | Send reset email form |
| `app/client/reset-password/page.tsx` | Set new password after reset link |
| `app/client/page.tsx` | Dashboard: list of client's events |
| `app/client/[eventId]/layout.tsx` | Client event layout with nav |
| `app/client/[eventId]/tasks/page.tsx` | Tasks view |
| `app/client/[eventId]/guests/page.tsx` | Guests view |
| `app/client/[eventId]/appointments/page.tsx` | Appointments view |
| `app/(planner)/events/[eventId]/client-accounts-tab.tsx` | Invite/revoke UI for planner |
| `tests/lib/client-session.test.ts` | Unit tests for `requireClientSession` |
| `tests/api/planner-client-accounts.test.ts` | Unit tests for client-accounts API |

### Modified Files
| File | Change |
|------|--------|
| `middleware.ts` | Add redirect to `/client/login` for unauthenticated `/client/*` requests |
| `app/(planner)/events/[eventId]/planner-event-detail.tsx` | Replace "Client" tab with client-accounts management tab |
| `tests/lib/client-access.test.ts` | Replace old token tests with session tests (rename to client-session.test.ts) |

### Files to Delete (after new routes are live)
| File | Reason |
|------|--------|
| `app/api/client/appointments/route.ts` | Replaced by `[eventId]` version |
| `app/api/client/changes/route.ts` | Replaced |
| `app/api/client/event/route.ts` | Replaced |
| `app/api/client/guest-change/route.ts` | Replaced |
| `app/api/client/guests/route.ts` | Replaced |
| `app/api/client/tasks/route.ts` | Replaced |
| `app/api/client/tasks/[taskId]/comments/route.ts` | Replaced |
| `app/api/client/tasks/[taskId]/validate/route.ts` | Replaced |
| `app/api/planner/events/[id]/client-access/rotate/route.ts` | Replaced by client-accounts |
| `app/(client)/c/[clientToken]/**` | Replaced by `/client/[eventId]/**` |

---

## Chunk 1: DB Migration + Backend Core

### Task 1: DB Migration

**Files:**
- Create: `sql/migrations/007_client-auth.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- sql/migrations/007_client-auth.sql
-- Migrate client_access from token-based to user-based auth

-- 1. Add new columns
alter table client_access
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists is_revoked boolean not null default false,
  add column if not exists invited_at timestamptz not null default now();

-- 2. Make user_id + event_id unique (one row per user per event)
create unique index if not exists client_access_user_event_idx
  on client_access(user_id, event_id)
  where user_id is not null;

-- 3. Drop old columns (after verifying new columns exist)
alter table client_access
  drop column if exists client_token,
  drop column if exists expires_at;

-- 4. Add index for fast user lookup
create index if not exists client_access_user_id_idx on client_access(user_id);
```

- [ ] **Step 2: Apply migration in Supabase**

Run in the Supabase SQL editor (or via CLI):
```
supabase db push
```
Or paste the SQL directly in Supabase Studio → SQL Editor.

- [ ] **Step 3: Update `sql/schema.sql` to reflect new structure**

Replace the `client_access` table definition in `sql/schema.sql`:
```sql
create table if not exists client_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  is_revoked boolean not null default false,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, event_id)
);
create index if not exists client_access_user_id_idx on client_access(user_id);
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add sql/migrations/007_client-auth.sql sql/schema.sql
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: db migration - client_access moves to user-based auth"
```

---

### Task 2: `requireClientSession` Helper

**Files:**
- Modify: `lib/server/client.ts`
- Create: `tests/lib/client-session.test.ts`
- Delete: `tests/lib/client-access.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/client-session.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock supabaseServer (reads session cookie) ────────────────────────────
let mockGetUser: { data: { user: unknown }; error: unknown } = {
  data: { user: null },
  error: null,
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () =>
    Promise.resolve({
      auth: { getUser: vi.fn(() => Promise.resolve(mockGetUser)) },
    }),
}))

// ─── Mock supabaseAdmin (DB queries) ──────────────────────────────────────
let mockAccessResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(mockAccessResult)),
    })),
  }),
}))

const { requireClientSession } = await import("@/lib/server/client")

describe("requireClientSession", () => {
  const EVENT_ID = "event-uuid-1234"

  beforeEach(() => {
    mockGetUser = { data: { user: null }, error: null }
    mockAccessResult = { data: null, error: null }
  })

  it("returns 401 when no authenticated session", async () => {
    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it("returns 403 when session exists but no client_access row", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    // PGRST116 = PostgREST "no rows found" — must use this code so the
    // implementation falls through to the !access check (returns 403),
    // rather than treating it as a generic DB error (returns 500).
    mockAccessResult = { data: null, error: { code: "PGRST116", message: "no rows" } }

    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns 403 when access is revoked", async () => {
    mockGetUser = {
      data: { user: { id: "user-abc", email: "client@test.com" } },
      error: null,
    }
    mockAccessResult = {
      data: { event_id: EVENT_ID, is_revoked: true },
      error: null,
    }

    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns ok with userId and eventId for valid session with active access", async () => {
    const userId = "user-abc"
    mockGetUser = {
      data: { user: { id: userId, email: "client@test.com" } },
      error: null,
    }
    mockAccessResult = {
      data: { event_id: EVENT_ID, is_revoked: false },
      error: null,
    }

    const result = await requireClientSession(EVENT_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.eventId).toBe(EVENT_ID)
      expect(result.userId).toBe(userId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run tests/lib/client-session.test.ts
```
Expected: FAIL — `requireClientSession is not a function` (or similar import error)

- [ ] **Step 3: Replace `lib/server/client.ts` with new helper**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run tests/lib/client-session.test.ts
```
Expected: All 4 tests pass.

- [ ] **Step 5: Delete old test file**

```bash
rm /Users/A.BEYE/KPLAN/kplan/tests/lib/client-access.test.ts
```

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run
```
Expected: All tests pass (previous tests that imported `requireClientAccess` will fail — fix them or delete them as they're being replaced).

- [ ] **Step 7: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add lib/server/client.ts tests/lib/client-session.test.ts
git -C /Users/A.BEYE/KPLAN/kplan rm tests/lib/client-access.test.ts
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: replace requireClientAccess with requireClientSession (session-based auth)"
```

---

### Task 3: New Client API Routes `/api/client/[eventId]/*`

**Files:**
- Create: 8 route files under `app/api/client/[eventId]/`

All routes follow the same pattern: call `requireClientSession(eventId)`, then use `supabaseAdmin()` for DB queries (same logic as existing flat routes, just no token param).

- [ ] **Step 1: Create `app/api/client/[eventId]/event/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: event, error } = await db
    .from("events")
    .select("*")
    .eq("id", gate.eventId)
    .single()

  if (error || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  return NextResponse.json({ event })
}
```

- [ ] **Step 2: Create `app/api/client/[eventId]/appointments/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  const { data: event, error: ee } = await db
    .from("events")
    .select("id, title")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const now = new Date().toISOString()
  const { data: appointments, error: ae } = await db
    .from("appointments")
    .select("*")
    .eq("event_id", gate.eventId)
    .gte("start_at", now)
    .order("start_at", { ascending: true })

  if (ae) return NextResponse.json({ error: ae.message }, { status: 500 })
  return NextResponse.json({ event: { id: event.id, title: event.title }, appointments: appointments || [] })
}
```

- [ ] **Step 3: Create `app/api/client/[eventId]/changes/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: changes, error } = await db
    .from("guest_changes")
    .select("*")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ changes })
}
```

- [ ] **Step 4: Create `app/api/client/[eventId]/guests/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: guests, error } = await db
    .from("guests")
    .select("*")
    .eq("event_id", gate.eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guests })
}
```

- [ ] **Step 5: Create `app/api/client/[eventId]/guest-change/route.ts`**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

const Body = z.object({
  action: z.enum(["create", "update", "delete"]),
  guestId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(
  req: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const { action, guestId, payload } = parsed.data
  if (action !== "create" && !guestId)
    return NextResponse.json({ error: "Missing guestId" }, { status: 400 })

  const db = supabaseAdmin()

  if (guestId) {
    const { data: g } = await db
      .from("guests")
      .select("id,event_id,deleted_at")
      .eq("id", guestId)
      .maybeSingle()
    if (!g) return NextResponse.json({ error: "Guest not found" }, { status: 404 })
    if (g.event_id !== gate.eventId)
      return NextResponse.json({ error: "Guest does not belong to event" }, { status: 403 })
    if (g.deleted_at) return NextResponse.json({ error: "Guest already deleted" }, { status: 409 })
  }

  const { data: change, error } = await db.from("guest_changes").insert({
    event_id: gate.eventId,
    guest_id: guestId ?? null,
    action,
    payload: payload ?? {},
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ change }, { status: 201 })
}
```

- [ ] **Step 6: Create `app/api/client/[eventId]/tasks/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientSession } from "@/lib/server/client"

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  const { data: event, error: ee } = await db
    .from("events")
    .select("id, title, start_at")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const { data: tasks, error: te } = await db
    .from("tasks")
    .select("*")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (te) return NextResponse.json({ error: te.message }, { status: 500 })

  const { data: milestones } = await db
    .from("milestones")
    .select("id, name")
    .eq("event_id", gate.eventId)

  const milestoneMap: Record<string, string> = {}
  ;(milestones ?? []).forEach((m: any) => { milestoneMap[m.id] = m.name })

  const { data: comments, error: ce } = await db
    .from("task_comments")
    .select("task_id")
    .eq("event_id", gate.eventId)

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })

  const { data: validations, error: ve } = await db
    .from("task_validations")
    .select("task_id, status, client_comment")
    .eq("event_id", gate.eventId)
    .order("created_at", { ascending: false })

  if (ve) return NextResponse.json({ error: ve.message }, { status: 500 })

  const commentsByTask: Record<string, number> = {}
  comments?.forEach((c) => { commentsByTask[c.task_id] = (commentsByTask[c.task_id] || 0) + 1 })

  const validationByTask: Record<string, { status: string; comment: string | null }> = {}
  validations?.forEach((v: any) => {
    if (!validationByTask[v.task_id]) {
      validationByTask[v.task_id] = { status: v.status, comment: v.client_comment }
    }
  })

  const enrichedTasks = (tasks || []).map((task: any) => ({
    ...task,
    due_date: task.due_at,
    milestone_title: task.milestone_id ? (milestoneMap[task.milestone_id] ?? null) : null,
    comments_count: commentsByTask[task.id] || 0,
    validation: validationByTask[task.id] || null,
  }))

  const total = enrichedTasks.length
  const completed = enrichedTasks.filter((t: any) => t.status === "done").length
  const overdue_count = enrichedTasks.filter(
    (t: any) => t.status !== "done" && t.due_at && new Date(t.due_at) < new Date(),
  ).length

  return NextResponse.json({
    tasks: enrichedTasks,
    progress: { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, overdue_count },
    event: { id: event.id, title: event.title, start_at: event.start_at },
  })
}
```

- [ ] **Step 7: Create `app/api/client/[eventId]/tasks/[taskId]/comments/route.ts`**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications/create-notification"
import { requireClientSession } from "@/lib/server/client"

const PostBodySchema = z.object({ content: z.string().min(1) })

export async function GET(
  _: Request,
  context: { params: Promise<{ eventId: string; taskId: string }> },
) {
  const { eventId, taskId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()

  const { data: task, error: te } = await db
    .from("tasks")
    .select("id, event_id")
    .eq("id", taskId)
    .eq("event_id", gate.eventId)
    .single()

  if (te || !task) return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 })

  const { data: comments, error: ce } = await db
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })
  return NextResponse.json({ comments: comments || [] })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ eventId: string; taskId: string }> },
) {
  const { eventId, taskId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null)
  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const db = supabaseAdmin()

  const { data: task, error: te } = await db
    .from("tasks")
    .select("id, event_id, title")
    .eq("id", taskId)
    .eq("event_id", gate.eventId)
    .single()

  if (te || !task) return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 })

  const { data: comment, error: ce } = await db
    .from("task_comments")
    .insert({
      task_id: taskId,
      event_id: gate.eventId,
      author_type: "client",
      author_name: "Client",
      content: parsed.data.content,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (ce || !comment) return NextResponse.json({ error: ce?.message || "Failed to create comment" }, { status: 500 })

  await createNotification({
    event_id: gate.eventId,
    recipient_type: "planner",
    type: "client_commented",
    title: "Nouveau commentaire client",
    message: `Le client a commenté la tâche: "${task.title}"`,
    related_id: taskId,
  })

  return NextResponse.json({ comment }, { status: 201 })
}
```

- [ ] **Step 8: Create `app/api/client/[eventId]/tasks/[taskId]/validate/route.ts`**

```ts
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
  context: { params: Promise<{ eventId: string; taskId: string }> },
) {
  const { eventId, taskId } = await context.params
  const gate = await requireClientSession(eventId)
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const db = supabaseAdmin()

  const { data: task, error: te } = await db
    .from("tasks")
    .select("id, event_id, title, requires_client_validation")
    .eq("id", taskId)
    .eq("event_id", gate.eventId)
    .single()

  if (te || !task) return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 })
  if (!task.requires_client_validation)
    return NextResponse.json({ error: "Task does not require client validation" }, { status: 400 })

  const validationStatus = parsed.data.approved ? "validated" : "refused"
  const clientComment = parsed.data.comment ?? null

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
      .update({ status: validationStatus, client_comment: clientComment, validated_at: now })
      .eq("id", existingValidation.id)
      .select("*")
      .single()
    if (updateError || !updated)
      return NextResponse.json({ error: updateError?.message || "Failed to update validation" }, { status: 500 })
    validation = updated
  } else {
    const { data: created, error: createError } = await db
      .from("task_validations")
      .insert({ task_id: taskId, event_id: gate.eventId, status: validationStatus, client_comment: clientComment, validated_at: now, created_at: now })
      .select("*")
      .single()
    if (createError || !created)
      return NextResponse.json({ error: createError?.message || "Failed to create validation" }, { status: 500 })
    validation = created
  }

  const notificationType = validationStatus === "validated" ? "client_validated" : "client_refused"
  await createNotification({
    event_id: gate.eventId,
    recipient_type: "planner",
    type: notificationType,
    title: validationStatus === "validated" ? "Tâche validée par le client" : "Tâche refusée par le client",
    message: validationStatus === "validated"
      ? `Le client a validé la tâche: "${task.title}"`
      : `Le client a refusé la tâche: "${task.title}"${clientComment ? ` - Raison: ${clientComment}` : ""}`,
    related_id: taskId,
  })

  return NextResponse.json({ validation }, { status: 200 })
}
```

- [ ] **Step 9: Run TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/api/client/
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: add session-based client API routes under /api/client/[eventId]/*"
```

---

### Task 4: Planner Client-Accounts API Routes

**Files:**
- Create: `app/api/planner/events/[id]/client-accounts/route.ts`
- Create: `app/api/planner/events/[id]/client-accounts/[uid]/route.ts`
- Create: `tests/api/planner-client-accounts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/planner-client-accounts.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequest } from "../api/__helpers"

// ─── Mock planner session ──────────────────────────────────────────────────
let mockPlannerOk = true
vi.mock("@/lib/server/planner", () => ({
  requirePlannerSession: vi.fn(() =>
    Promise.resolve(
      mockPlannerOk
        ? { ok: true as const, user: { id: "planner-1", email: "planner@test.com" } }
        : { ok: false as const, response: new Response(null, { status: 401 }) },
    )
  ),
}))

// ─── Mock supabaseAdmin ────────────────────────────────────────────────────
// Each test sets these before calling the route.
let mockSelectResult: { data: unknown; error: unknown } = { data: [], error: null }
let mockMaybeSingleResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockUpdateResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockInviteResult: { data: { user: { id: string } | null }; error: unknown } = {
  data: { user: { id: "new-user-1" } },
  error: null,
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn(() => ({ select: vi.fn().mockReturnThis(), single: vi.fn(() => Promise.resolve(mockInsertResult)) })),
      update: vi.fn(() => ({ eq: vi.fn().mockReturnThis(), single: vi.fn(() => Promise.resolve(mockUpdateResult)) })),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve(mockSelectResult)),
      maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
      single: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
    })),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(() => Promise.resolve(mockInviteResult)),
      },
    },
  }),
}))

const { GET, POST } = await import("@/app/api/planner/events/[id]/client-accounts/route")
const { DELETE } = await import("@/app/api/planner/events/[id]/client-accounts/[uid]/route")

beforeEach(() => {
  mockPlannerOk = true
  mockSelectResult = { data: [], error: null }
  mockMaybeSingleResult = { data: null, error: null }
  mockUpdateResult = { data: null, error: null }
  mockInsertResult = { data: null, error: null }
  mockInviteResult = { data: { user: { id: "new-user-1" } }, error: null }
})

describe("GET /api/planner/events/[id]/client-accounts", () => {
  it("returns 401 when not authenticated as planner", async () => {
    mockPlannerOk = false
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts")
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await GET(req, context)
    expect(res.status).toBe(401)
  })

  it("returns 200 with account list", async () => {
    mockSelectResult = {
      data: [{ id: "acc-1", email: "client@test.com", is_revoked: false, invited_at: new Date().toISOString(), user_id: "u1" }],
      error: null,
    }
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts")
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await GET(req, context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accounts).toHaveLength(1)
  })
})

describe("POST /api/planner/events/[id]/client-accounts", () => {
  it("returns 400 for invalid email", async () => {
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts", {
      json: { email: "not-an-email" },
    })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await POST(req, context)
    expect(res.status).toBe(400)
  })

  it("returns 409 when client already has active access", async () => {
    mockMaybeSingleResult = { data: { id: "acc-existing", is_revoked: false }, error: null }
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts", {
      json: { email: "client@test.com" },
    })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc" }) }
    const res = await POST(req, context)
    expect(res.status).toBe(409)
  })
})

describe("DELETE /api/planner/events/[id]/client-accounts/[uid]", () => {
  it("returns 401 when not authenticated as planner", async () => {
    mockPlannerOk = false
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts/acc-1", { method: "DELETE" })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc", uid: "3e7c3f19-4b2a-4f6d-9e1c-000000000001" }) }
    const res = await DELETE(req, context)
    expect(res.status).toBe(401)
  })

  it("returns 200 on successful revoke", async () => {
    mockUpdateResult = { data: { id: "acc-1" }, error: null }
    const req = createRequest("http://localhost/api/planner/events/evt-1/client-accounts/acc-1", { method: "DELETE" })
    const context = { params: Promise.resolve({ id: "3e7c3f19-4b2a-4f6d-9e1c-123456789abc", uid: "3e7c3f19-4b2a-4f6d-9e1c-000000000001" }) }
    const res = await DELETE(req, context)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run tests/api/planner-client-accounts.test.ts
```
Expected: FAIL — route files don't exist yet.

- [ ] **Step 3: Create `app/api/planner/events/[id]/client-accounts/route.ts`**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })
const InviteBody = z.object({ email: z.string().email() })

// GET — list all client accounts for this event
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from("client_access")
    .select("id, email, is_revoked, invited_at, user_id")
    .eq("event_id", parsed.data.id)
    .order("invited_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

// POST — invite a new client by email
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const eventId = parsed.data.id

  const json = await req.json().catch(() => null)
  const body = InviteBody.safeParse(json)
  if (!body.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 })

  const { email } = body.data
  const db = supabaseAdmin()

  // Check if already invited to this event
  const { data: existing } = await db
    .from("client_access")
    .select("id, is_revoked")
    .eq("event_id", eventId)
    .eq("email", email)
    .maybeSingle()

  if (existing && !existing.is_revoked) {
    return NextResponse.json({ error: "Client already has access to this event" }, { status: 409 })
  }

  // Invite via Supabase Auth (sends invitation email with set-password link)
  const { data: inviteData, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/client/set-password`,
  })

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  const userId = inviteData.user?.id

  // Insert or restore client_access row
  if (existing && existing.is_revoked) {
    // Re-activate revoked access
    await db
      .from("client_access")
      .update({ is_revoked: false, invited_at: new Date().toISOString(), user_id: userId })
      .eq("id", existing.id)
  } else {
    await db.from("client_access").insert({
      event_id: eventId,
      email,
      user_id: userId ?? null,
      is_revoked: false,
    })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/planner/events/[id]/client-accounts/[uid]/route.ts`**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid(), uid: z.string().uuid() })

// DELETE — revoke a client's access (by client_access.id, not user id)
export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string; uid: string }> },
) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 })

  const { id: eventId, uid: accessId } = parsed.data
  const db = supabaseAdmin()

  const { data: updated, error } = await db
    .from("client_access")
    .update({ is_revoked: true })
    .eq("id", accessId)
    .eq("event_id", eventId) // safety check: must belong to this event
    .select("id")
    .single()

  if (error && error.code !== "PGRST116") return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: "Access record not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run tests/api/planner-client-accounts.test.ts
```
Expected: All tests pass.

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/api/planner/events/ tests/api/planner-client-accounts.test.ts
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: planner client-accounts API (invite + revoke)"
```

---

## Chunk 2: Middleware + Client Frontend

### Task 5: Middleware — Protect `/client/*` Routes

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Update `middleware.ts` to redirect unauthenticated clients**

```ts
import { NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServerClient } from "@supabase/ssr"

// Pages that don't require a session
const CLIENT_AUTH_PAGES = ["/client/login", "/client/forgot-password", "/client/reset-password", "/client/set-password"]

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  const path = request.nextUrl.pathname

  // Protect /client/* routes
  if (path.startsWith("/client")) {
    const isAuthPage = CLIENT_AUTH_PAGES.some((p) => path === p || path.startsWith(p + "/"))
    if (!isAuthPage) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (url && anon) {
        const supabase = createServerClient(url, anon, {
          cookies: {
            getAll() { return request.cookies.getAll() },
            setAll() {},
          },
        })
        const { data } = await supabase.auth.getUser()
        if (!data?.user) {
          const loginUrl = new URL("/client/login", request.url)
          loginUrl.searchParams.set("next", path)
          return NextResponse.redirect(loginUrl)
        }
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add middleware.ts
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: middleware protects /client/* routes, redirects to /client/login"
```

---

### Task 6: Client Auth Pages (Login, Forgot Password, Reset Password, Set Password)

**Files:**
- Create: `app/client/layout.tsx`
- Create: `app/client/login/page.tsx`
- Create: `app/client/forgot-password/page.tsx`
- Create: `app/client/reset-password/page.tsx`
- Create: `app/client/set-password/page.tsx`

All pages are `"use client"` components using `supabaseBrowser()` from `@/lib/supabase/browser`.

- [ ] **Step 1: Create `app/client/layout.tsx`** (minimal — no auth check, middleware handles it)

```tsx
export default function ClientAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/client/login/page.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ClientLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/client"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError("Email ou mot de passe incorrect.")
      setLoading(false)
      return
    }

    router.push(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Espace client</CardTitle>
        <CardDescription>Connectez-vous pour accéder à votre événement.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            <Link href="/client/forgot-password" className="underline underline-offset-4 hover:text-foreground">
              Mot de passe oublié ?
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create `app/client/forgot-password/page.tsx`**

```tsx
"use client"

import { useState } from "react"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = supabaseBrowser()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/client/reset-password`,
    })
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email envoyé</CardTitle>
          <CardDescription>
            Vérifiez votre boîte mail et cliquez sur le lien pour réinitialiser votre mot de passe.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>Entrez votre email pour recevoir un lien de réinitialisation.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Envoi…" : "Envoyer le lien"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Create `app/client/reset-password/page.tsx`**

Supabase redirects here with `?code=...` in the URL. We call `exchangeCodeForSession` then `updateUser`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Exchange the code from URL for a session
    const code = searchParams.get("code")
    if (!code) return
    const supabase = supabaseBrowser()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setError("Lien invalide ou expiré.")
      else setReady(true)
    })
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.")
      return
    }
    setError(null)
    setLoading(true)
    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push("/client")
  }

  if (!ready && !error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vérification du lien…</CardTitle>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>Choisissez un mot de passe sécurisé (8 caractères minimum).</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmer</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !ready}>
            {loading ? "Enregistrement…" : "Enregistrer le mot de passe"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Create `app/client/set-password/page.tsx`** (same as reset-password, used after invite link)

Reuse the same logic — Supabase invitation links also include a `?code=...` parameter:

```tsx
// app/client/set-password/page.tsx
// Same component as reset-password — Supabase invite links use the same exchange flow.
// Copy reset-password/page.tsx and update CardTitle to "Créer votre mot de passe"
// and CardDescription to "Bienvenue ! Choisissez un mot de passe pour votre compte."
```

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/client/
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: client auth pages (login, forgot-password, reset-password, set-password)"
```

---

### Task 7: Client Dashboard (Event List)

**Files:**
- Create: `app/client/page.tsx`

The dashboard fetches the list of events the current user has access to.

- [ ] **Step 1: Create `app/client/page.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CalendarDays, LogOut } from "lucide-react"

type EventAccess = {
  event_id: string
  events: {
    id: string
    title: string
    start_at: string | null
  }
}

export default function ClientDashboard() {
  const router = useRouter()
  const [events, setEvents] = useState<EventAccess[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = supabaseBrowser()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/client/login"); return }

      const { data } = await supabase
        .from("client_access")
        .select("event_id, events(id, title, start_at)")
        .eq("user_id", user.id)
        .eq("is_revoked", false)
        .order("invited_at", { ascending: false })

      setEvents((data as unknown as EventAccess[]) ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function handleLogout() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.push("/client/login")
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-dvh">Chargement…</div>
  }

  return (
    <div className="min-h-dvh p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mes événements</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground text-center mt-12">
          Aucun événement disponible pour le moment.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((acc) => (
            <Link key={acc.event_id} href={`/client/${acc.event_id}/tasks`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{acc.events?.title ?? "Événement"}</CardTitle>
                  {acc.events?.start_at && (
                    <CardDescription className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(acc.events.start_at).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "long", year: "numeric"
                      })}
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Important:** This page uses `supabaseBrowser()` which calls the Supabase API directly from the browser with the anon key. The `client_access` table must have RLS enabled allowing users to read their own rows. Add this RLS policy:

```sql
-- In Supabase SQL editor or add to 007 migration:
alter table client_access enable row level security;
create policy "clients can read own access" on client_access
  for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Add RLS policy to migration file `sql/migrations/007_client-auth.sql`**

Append to the migration:
```sql
-- RLS for client dashboard
alter table client_access enable row level security;
create policy "clients can read own access" on client_access
  for select using (auth.uid() = user_id);
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/client/page.tsx sql/migrations/007_client-auth.sql
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: client dashboard (event list) + RLS for client_access"
```

---

### Task 8: Client Event Pages

**Files:**
- Create: `app/client/[eventId]/layout.tsx`
- Create: `app/client/[eventId]/tasks/page.tsx`
- Create: `app/client/[eventId]/guests/page.tsx`
- Create: `app/client/[eventId]/appointments/page.tsx`

These pages replace `app/(client)/c/[clientToken]/*`. They use the same UI components but fetch from `/api/client/[eventId]/*` (session-based, no token in URL).

- [ ] **Step 1: Create `app/client/[eventId]/layout.tsx`**

```tsx
"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Tâches", path: "tasks" },
  { label: "Invités", path: "guests" },
  { label: "Rendez-vous", path: "appointments" },
]

export default function ClientEventLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const eventId = params.eventId as string

  async function handleLogout() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.push("/client/login")
  }

  return (
    <div className="min-h-dvh">
      <nav className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1">
            <Link href="/client" className="text-sm text-muted-foreground hover:text-foreground mr-4">
              ← Mes événements
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.path}
                href={`/client/${eventId}/${item.path}`}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  pathname.endsWith(`/${item.path}`)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Déconnexion
          </Button>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/client/[eventId]/tasks/page.tsx`**

Copy content from `app/(client)/c/[clientToken]/tasks/client-tasks-view.tsx` but:
- Remove the `clientToken` prop (no longer needed)
- Replace all fetch calls: `/api/client/tasks?token=${token}` → `/api/client/${eventId}/tasks`
- Replace `/api/client/tasks/${taskId}/comments?token=${token}` → `/api/client/${eventId}/tasks/${taskId}/comments`
- Replace `/api/client/tasks/${taskId}/validate?token=${token}` → `/api/client/${eventId}/tasks/${taskId}/validate`
- Remove `clientToken` from request bodies
- Get `eventId` from `useParams()` instead

The page wraps the view component:
```tsx
"use client"
import { useParams } from "next/navigation"
import ClientTasksView from "./client-tasks-view"

export default function ClientTasksPage() {
  const { eventId } = useParams()
  return <ClientTasksView eventId={eventId as string} />
}
```

Create `app/client/[eventId]/tasks/client-tasks-view.tsx` by adapting the original, with `eventId` prop replacing `clientToken`.

- [ ] **Step 3: Create `app/client/[eventId]/guests/page.tsx`**

Same pattern: copy from `app/(client)/c/[clientToken]/guests/`, adapt fetches to new routes.

- [ ] **Step 4: Create `app/client/[eventId]/appointments/page.tsx`**

Copy from `app/(client)/c/[clientToken]/appointments/`, adapt fetches.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/client/
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: client event pages (tasks, guests, appointments) with session auth"
```

---

## Chunk 3: Planner UI + Cleanup

### Task 9: Planner Client-Accounts Management Tab

**Files:**
- Create: `app/(planner)/events/[eventId]/client-accounts-tab.tsx`
- Modify: `app/(planner)/events/[eventId]/planner-event-detail.tsx`

- [ ] **Step 1: Create `app/(planner)/events/[eventId]/client-accounts-tab.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserPlus, UserX } from "lucide-react"

type ClientAccount = {
  id: string
  email: string
  is_revoked: boolean
  invited_at: string
  user_id: string | null
}

export default function ClientAccountsTab({ eventId }: { eventId: string }) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function fetchAccounts() {
    const res = await fetch(`/api/planner/events/${eventId}/client-accounts`)
    if (res.ok) {
      const json = await res.json()
      setAccounts(json.accounts ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [eventId])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    const res = await fetch(`/api/planner/events/${eventId}/client-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? "Erreur lors de l'invitation")
    } else {
      toast.success(`Invitation envoyée à ${inviteEmail}`)
      setInviteEmail("")
      setDialogOpen(false)
      fetchAccounts()
    }
    setInviting(false)
  }

  async function handleRevoke(accessId: string, email: string) {
    const res = await fetch(`/api/planner/events/${eventId}/client-accounts/${accessId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      toast.success(`Accès révoqué pour ${email}`)
      fetchAccounts()
    } else {
      toast.error("Erreur lors de la révocation")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Accès client</h3>
          <p className="text-sm text-muted-foreground">
            Invitez des clients à accéder à cet événement. Ils recevront un email pour créer leur mot de passe.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Inviter un client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un client</DialogTitle>
              <DialogDescription>
                Le client recevra un email lui permettant de créer son mot de passe et d'accéder à l'événement.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email du client</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@exemple.com"
                  required
                />
              </div>
              <Button type="submit" disabled={inviting} className="w-full">
                {inviting ? "Envoi…" : "Envoyer l'invitation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun client invité pour cet événement.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Invité le</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell className="font-medium">{acc.email}</TableCell>
                <TableCell>
                  {acc.is_revoked ? (
                    <Badge variant="destructive">Révoqué</Badge>
                  ) : acc.user_id ? (
                    <Badge variant="default">Actif</Badge>
                  ) : (
                    <Badge variant="secondary">En attente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(acc.invited_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell>
                  {!acc.is_revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(acc.id, acc.email)}
                      className="text-destructive hover:text-destructive"
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `planner-event-detail.tsx` — replace old "Client" tab with new one**

Find the existing "Client" tab content (around line 729 in `planner-event-detail.tsx`):
```tsx
<TabsContent value="client">
  {/* ... old token-based client access UI ... */}
</TabsContent>
```

Replace it with:
```tsx
<TabsContent value="client">
  <ClientAccountsTab eventId={eventId} />
</TabsContent>
```

And add the import at the top:
```tsx
import ClientAccountsTab from "./client-accounts-tab"
```

Also remove the `rotateClientAccess` function, `clientAccess` from state, and any references to `clientToken`/`clientPath` that are only used by the old tab.

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add "app/(planner)/events/[eventId]/"
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: planner client-accounts management tab (invite + revoke)"
```

---

### Task 10: Cleanup — Remove Old Token-Based Routes and Pages

- [ ] **Step 1: Delete old flat client API routes**

```bash
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/client/appointments
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/client/changes
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/client/event
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/client/guest-change
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/client/guests
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/client/tasks
```

- [ ] **Step 2: Delete old client-access rotate route**

```bash
rm -rf /Users/A.BEYE/KPLAN/kplan/app/api/planner/events/\[id\]/client-access
```

- [ ] **Step 3: Delete old token-based client pages**

```bash
rm -rf "/Users/A.BEYE/KPLAN/kplan/app/(client)/c"
```

- [ ] **Step 4: TypeScript check (critical — ensure nothing references deleted files)**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors. If errors, fix remaining references before proceeding.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 6: Next.js build check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx next build 2>&1 | tail -20
```
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add -A
git -C /Users/A.BEYE/KPLAN/kplan commit -m "chore: remove old token-based client routes and pages"
```

---

### Task 11: Environment Variable

- [ ] **Step 1: Add `NEXT_PUBLIC_APP_URL` to `.env.local`**

This is used in the planner invite route for the `redirectTo` URL:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
(set to the production URL when deploying)

- [ ] **Step 2: Verify `NEXT_PUBLIC_APP_URL` is referenced correctly in `app/api/planner/events/[id]/client-accounts/route.ts`**

The `redirectTo` uses `process.env.NEXT_PUBLIC_APP_URL`. Ensure this env var is set in Vercel/production as well.

- [ ] **Step 3: Commit (if `.env.local` is not gitignored — it should be)**

```bash
# .env.local is gitignored — just verify it's set locally and in production
echo "NEXT_PUBLIC_APP_URL is set: $NEXT_PUBLIC_APP_URL"
```

---

## Manual Testing Checklist

After all tasks are complete, verify these flows manually:

- [ ] Planner can invite a client via the "Client" tab → email received with working link
- [ ] Client clicks invite link → lands on `/client/set-password` → sets password → redirected to `/client`
- [ ] Client dashboard shows their events
- [ ] Client navigates to tasks/guests/appointments → data loads correctly
- [ ] Client can submit guest change, validate tasks, add comments
- [ ] Client logs out → redirected to `/client/login`
- [ ] Client visits `/client/tasks` without session → redirected to `/client/login`
- [ ] Client uses forgot-password → receives email → resets password → can log in
- [ ] Planner can revoke client access → client session still works but API calls to that event return 403
- [ ] Planner can re-invite a previously revoked client
