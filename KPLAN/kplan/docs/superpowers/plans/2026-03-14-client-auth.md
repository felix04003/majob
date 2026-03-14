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

---

## Chunk 4: Liquid Glass UI Design System

> **Context:** Tailwind CSS v4 project (`@import "tailwindcss"`, no `tailwind.config.ts`). Tokens go in `globals.css` via `@theme`. Dancing Script already loaded as `--font-handwriting`. Route groups: landing → `app/(public)/page.tsx`, login → `app/(auth)/login/login-client.tsx`, dashboard → `app/(planner)/dashboard/page.tsx`.

### File Map — Liquid Glass

| File | Action | Purpose |
|------|--------|---------|
| `app/globals.css` | Modify | Add Kplan design tokens, glass vars, animations |
| `app/layout.tsx` | Modify | Add `--font-dancing` alias, ambient orbs, dark-mode body gradient |
| `components/ui/glass-card.tsx` | Create | Reusable glass card (variants: default/strong/subtle/gold/danger) |
| `components/ui/kplan-button.tsx` | Create | Button with gold/glass/ghost-gold/danger variants |
| `components/ambient-background.tsx` | Create | 3 animated orbs + noise overlay |
| `components/ui/status-badge.tsx` | Create | Event status badges (active/jour-j/completed/pending) |
| `components/ui/skeleton-glass.tsx` | Create | Shimmer skeleton for loading states |
| `components/ui/gallery.tsx` | Create | PhotoGallery with framer-motion drag photos |
| `app/(auth)/login/login-client.tsx` | Modify | Full Liquid Glass transform |
| `app/(public)/page.tsx` | Modify | Deep-space hero, glass cards, PhotoGallery, stat counters |
| `components/planner-navbar.tsx` | Modify | Sticky glass navbar |
| `app/(planner)/dashboard/page.tsx` | Modify | KPI cards, event list with glass styling |

---

### Task 12: Design Tokens — `globals.css`

**Files:**
- Modify: `app/globals.css`

> Note: Tailwind v4 uses `@theme inline {}` for custom tokens (generates CSS classes like `text-kplan-gold`). Global CSS vars go in `:root`. Animations go in `@keyframes` blocks.

- [ ] **Step 1: Add Kplan brand tokens and glass vars to `globals.css`**

Append the following **before** the existing `@layer base` block:

```css
/* ─── Kplan Design Tokens ──────────────────────────────────────────────── */
:root {
  /* Brand palette */
  --kplan-gold:      #C9A96E;
  --kplan-rose:      #E8A0A0;
  --kplan-sage:      #8FAF8F;
  --kplan-midnight:  #0A0C1A;
  --kplan-navy:      #0D1240;

  /* Glass system */
  --glass-bg:          rgba(255,255,255,0.10);
  --glass-bg-strong:   rgba(255,255,255,0.18);
  --glass-border:      rgba(255,255,255,0.18);
  --glass-border-top:  rgba(255,255,255,0.35);
  --glass-shadow:      0 8px 32px rgba(0,0,0,0.20), 0 1px 0 rgba(255,255,255,0.10) inset;

  /* Text hierarchy */
  --text-1: rgba(255,255,255,0.95);
  --text-2: rgba(255,255,255,0.65);
  --text-3: rgba(255,255,255,0.40);

  /* Easing */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);

  /* Border radius */
  --r-sm:   12px;
  --r-md:   18px;
  --r-lg:   24px;
  --r-xl:   32px;
  --r-pill: 100px;
}

/* ─── Tailwind v4 custom color tokens ─────────────────────────────────── */
/* Extends @theme so Tailwind generates bg-kplan-gold, text-kplan-gold, etc. */
@theme inline {
  --color-kplan-gold:     #C9A96E;
  --color-kplan-rose:     #E8A0A0;
  --color-kplan-sage:     #8FAF8F;
  --color-kplan-midnight: #0A0C1A;
  --color-kplan-navy:     #0D1240;

  /* Font alias: Dancing Script is loaded as --font-handwriting in layout.tsx */
  --font-dancing: var(--font-handwriting);
}
```

- [ ] **Step 2: Append CSS animations to `globals.css`**

Add at the end of `globals.css`:

```css
/* ─── Liquid Glass Animations ─────────────────────────────────────────── */

/* Ambient orb float */
@keyframes float1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(60px,40px) scale(1.1)} }
@keyframes float2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-40px,60px) scale(0.9)} }
@keyframes float3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(1.05)} }

/* Shimmer skeleton */
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.skeleton-glass {
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Error shake */
@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
.shake { animation: shake 0.4s ease-in-out; }

/* Gold pulse (Jour J badge) */
@keyframes gold-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,0.5)} 50%{box-shadow:0 0 0 6px rgba(201,169,110,0)} }
.animate-gold-pulse { animation: gold-pulse 2s ease-in-out infinite; }

/* Confetti */
@keyframes confetti-fall { 0%{transform:translateY(-100px) rotate(0deg);opacity:1} 100%{transform:translateY(600px) rotate(720deg);opacity:0} }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  .skeleton-glass { animation: none; background: rgba(255,255,255,0.06); }
}
```

- [ ] **Step 3: Verify TypeScript / build (no TypeScript in CSS, just verify Next.js doesn't error)**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx next build 2>&1 | tail -10
```
Expected: Build succeeds (or only pre-existing errors).

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/globals.css
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: add Liquid Glass design tokens and animations to globals.css"
```

---

### Task 13: Root Layout — Ambient Orbs + Body Gradient

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

Replace the entire file with:

```tsx
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Dancing_Script } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const dancingScript = Dancing_Script({
  variable: "--font-handwriting",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "Kplan",
  description: "Planner + Client + Invités + Jour J (Next.js + Supabase)",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dancingScript.variable} antialiased`}
        style={{ background: "linear-gradient(135deg, #0A0C1A 0%, #0D1240 30%, #1A0A2A 60%, #0A1020 100%)", minHeight: "100dvh" }}
      >
        {/* Ambient gradient orbs — fixed behind all content */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -z-10"
          style={{ width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,169,110,0.25) 0%, transparent 70%)", top: -200, left: -100, filter: "blur(80px)", animation: "float1 18s ease-in-out infinite" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -z-10"
          style={{ width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(90,200,250,0.18) 0%, transparent 70%)", top: "30%", right: -150, filter: "blur(80px)", animation: "float2 22s ease-in-out infinite" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -z-10"
          style={{ width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,160,160,0.20) 0%, transparent 70%)", bottom: "10%", left: "20%", filter: "blur(80px)", animation: "float3 16s ease-in-out infinite" }}
        />

        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

> **Note:** `defaultTheme="dark"` + `enableSystem={false}` forces dark mode, which is required for the deep-space glass aesthetic. If you need to support light mode, this must be revisited separately.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Visual check — screenshot the app**

```bash
# Server is already running on port 3001 — take a screenshot via preview tool
# Expected: deep dark background with 3 soft glowing orbs visible
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add app/layout.tsx
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: add ambient orbs and dark space background to root layout"
```

---

### Task 14: Global Glass Components

**Files:**
- Create: `components/ui/glass-card.tsx`
- Create: `components/ui/kplan-button.tsx`
- Create: `components/ui/status-badge.tsx`
- Create: `components/ui/skeleton-glass.tsx`

- [ ] **Step 1: Create `components/ui/glass-card.tsx`**

```tsx
import { cn } from "@/lib/utils"

type GlassVariant = "default" | "strong" | "subtle" | "gold" | "danger"
type GlassPadding = "sm" | "md" | "lg"

interface GlassCardProps {
  variant?: GlassVariant
  hover?: boolean
  padding?: GlassPadding
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

const variantStyles: Record<GlassVariant, string> = {
  default: "bg-white/10 border-white/18",
  strong:  "bg-white/18 border-white/25",
  subtle:  "bg-white/5  border-white/10",
  gold:    "bg-[#C9A96E]/10 border-[#C9A96E]/30",
  danger:  "bg-red-500/5 border-red-500/20",
}

const paddingStyles: Record<GlassPadding, string> = {
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
}

export function GlassCard({
  variant = "default",
  hover = false,
  padding = "md",
  className,
  children,
  style,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur-[24px]",
        variantStyles[variant],
        paddingStyles[padding],
        hover && "transition-transform duration-200 hover:-translate-y-1 hover:scale-[1.01] cursor-pointer",
        className,
      )}
      style={{
        boxShadow: "var(--glass-shadow)",
        ...style,
      }}
    >
      {/* Inner top highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
      />
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/ui/kplan-button.tsx`**

```tsx
import { cn } from "@/lib/utils"
import { ButtonHTMLAttributes, forwardRef } from "react"

type KplanVariant = "gold" | "glass" | "ghost-gold" | "danger"

interface KplanButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KplanVariant
  size?: "sm" | "md" | "lg"
  loading?: boolean
}

const variantStyles: Record<KplanVariant, string> = {
  gold:        "text-[#0A0C1A] font-semibold border-0",
  glass:       "text-white/90 border border-white/20 bg-white/10 hover:bg-white/15 backdrop-blur-[24px]",
  "ghost-gold": "text-[#C9A96E] border border-[#C9A96E]/30 bg-transparent hover:bg-[#C9A96E]/10",
  danger:      "text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20",
}

const sizeStyles = { sm: "h-9 px-4 text-sm", md: "h-11 px-6 text-sm", lg: "h-14 px-8 text-base" }

export const KplanButton = forwardRef<HTMLButtonElement, KplanButtonProps>(
  ({ variant = "gold", size = "md", loading, disabled, className, children, style, ...props }, ref) => {
    const isGold = variant === "gold"
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "relative inline-flex items-center justify-center rounded-[100px] font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(201,169,110,0.4)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-[0.97]",
          sizeStyles[size],
          variantStyles[variant],
          !disabled && !loading && "hover:scale-[1.02] hover:-translate-y-px",
          className,
        )}
        style={{
          ...(isGold ? { background: "linear-gradient(135deg, #C9A96E, #E8A0A0)" } : {}),
          minHeight: 44, // Apple HIG touch target
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    )
  }
)
KplanButton.displayName = "KplanButton"
```

- [ ] **Step 3: Create `components/ui/status-badge.tsx`**

```tsx
import { cn } from "@/lib/utils"

type EventStatus = "active" | "jour-j" | "completed" | "pending" | "cancelled"

const config: Record<EventStatus, { label: string; classes: string; pulse?: boolean }> = {
  active:    { label: "En cours",  classes: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  "jour-j":  { label: "Jour J",    classes: "bg-[#C9A96E]/15 text-[#C9A96E] border-[#C9A96E]/30", pulse: true },
  completed: { label: "Terminé",   classes: "bg-green-500/15 text-green-300 border-green-500/30" },
  pending:   { label: "En attente",classes: "bg-white/8 text-white/50 border-white/15" },
  cancelled: { label: "Annulé",    classes: "bg-red-500/15 text-red-300 border-red-500/30" },
}

export function StatusBadge({ status, className }: { status: EventStatus; className?: string }) {
  const { label, classes, pulse } = config[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", classes, className)}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-gold-pulse")}
      />
      {label}
    </span>
  )
}
```

- [ ] **Step 4: Create `components/ui/skeleton-glass.tsx`**

```tsx
import { cn } from "@/lib/utils"

export function SkeletonGlass({ className }: { className?: string }) {
  return <div className={cn("skeleton-glass rounded-xl", className)} aria-hidden />
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-[24px]">
      <SkeletonGlass className="mb-3 h-4 w-1/3" />
      <SkeletonGlass className="mb-2 h-8 w-1/2" />
      <SkeletonGlass className="h-3 w-2/3" />
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add components/ui/glass-card.tsx components/ui/kplan-button.tsx components/ui/status-badge.tsx components/ui/skeleton-glass.tsx
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: add global Liquid Glass components (GlassCard, KplanButton, StatusBadge, SkeletonGlass)"
```

---

### Task 15: PhotoGallery Component + Install framer-motion

**Files:**
- Create: `components/ui/gallery.tsx`

- [ ] **Step 1: Install framer-motion**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npm install framer-motion
```
Expected: Package installed, no peer-dep errors.

- [ ] **Step 2: Create `components/ui/gallery.tsx`**

Create the file exactly as provided in the spec (`kplan-liquid-glass-prompt.md`, section "File to create: `components/ui/gallery.tsx`").

Key adaptations from the prompt:
- `var(--font-dancing)` — works because we aliased it to `var(--font-handwriting)` in Step 12
- Keep all 5 Pexels photo URLs as-is
- The `Button` import uses shadcn's `@/components/ui/button`

```tsx
"use client"
import { Ref, forwardRef, useState, useEffect } from "react"
import Image, { ImageProps } from "next/image"
import Link from "next/link"
import { motion, useMotionValue } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export const PhotoGallery = ({ animationDelay = 0.5 }: { animationDelay?: number }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    const v = setTimeout(() => setIsVisible(true), animationDelay * 1000)
    const a = setTimeout(() => setIsLoaded(true), (animationDelay + 0.4) * 1000)
    return () => { clearTimeout(v); clearTimeout(a) }
  }, [animationDelay])

  const containerVariants = {
    hidden:  { opacity: 1 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
  }

  const photoVariants = {
    hidden:  () => ({ x: 0, y: 0, rotate: 0, scale: 1 }),
    visible: (c: { x: string; y: string; order: number }) => ({
      x: c.x, y: c.y, rotate: 0, scale: 1,
      transition: { type: "spring", stiffness: 70, damping: 12, mass: 1, delay: c.order * 0.15 },
    }),
  }

  const allPhotos = [
    { id: 1, order: 0, x: "-320px", y: "15px",  xMobile: "-160px", yMobile: "8px",  zIndex: 50, direction: "left"  as const, src: "https://images.pexels.com/photos/32025694/pexels-photo-32025694/free-photo-of-romantic-wedding-in-ancient-ruins.jpeg" },
    { id: 2, order: 1, x: "-160px", y: "32px",  xMobile: "0px",    yMobile: "16px", zIndex: 40, direction: "left"  as const, src: "https://images.pexels.com/photos/31596551/pexels-photo-31596551/free-photo-of-winter-scene-with-lake-view-in-van-turkiye.jpeg" },
    { id: 3, order: 2, x: "0px",    y: "8px",   xMobile: "160px",  yMobile: "24px", zIndex: 30, direction: "right" as const, src: "https://images.pexels.com/photos/31890053/pexels-photo-31890053/free-photo-of-moody-portrait-with-heart-shaped-light.jpeg" },
    { id: 4, order: 3, x: "160px",  y: "22px",  xMobile: "160px",  yMobile: "22px", zIndex: 20, direction: "right" as const, src: "https://images.pexels.com/photos/19936068/pexels-photo-19936068/free-photo-of-women-sitting-on-hilltop-with-clouds-below.jpeg" },
    { id: 5, order: 4, x: "320px",  y: "44px",  xMobile: "320px",  yMobile: "44px", zIndex: 10, direction: "left"  as const, src: "https://images.pexels.com/photos/20494995/pexels-photo-20494995/free-photo-of-head-of-peacock.jpeg" },
  ]
  const photos = isMobile ? allPhotos.slice(0, 3) : allPhotos
  const photoSize = isMobile ? 160 : 220

  return (
    <div
      className="mt-40 relative rounded-3xl px-4 py-8"
      style={{ backdropFilter: "blur(24px) saturate(180%)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Background grid accent */}
      <div className="absolute inset-0 max-md:hidden top-[200px] -z-10 h-[300px] w-full bg-[linear-gradient(to_right,#C9A96E_1px,transparent_1px),linear-gradient(to_bottom,#C9A96E_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-10 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <p className="lg:text-md my-2 text-center text-xs font-light uppercase tracking-widest text-kplan-gold">
        Événements organisés avec Kplan
      </p>
      <h3
        className="z-20 mx-auto max-w-2xl justify-center bg-clip-text py-3 text-center text-4xl text-transparent md:text-6xl"
        style={{ backgroundImage: "linear-gradient(160deg, #ffffff 0%, #C9A96E 50%, #E8A0A0 100%)" }}
      >
        Nos <span style={{ fontFamily: "var(--font-dancing)", fontStyle: "italic" }}>événements</span>
      </h3>

      <div className="relative mb-8 h-[350px] w-full items-center justify-center lg:flex">
        <motion.div
          className="relative mx-auto flex w-full max-w-7xl justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: isVisible ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <motion.div
            className="relative flex w-full justify-center"
            variants={containerVariants}
            initial="hidden"
            animate={isLoaded ? "visible" : "hidden"}
          >
            <div className="relative" style={{ height: photoSize, width: photoSize }}>
              {[...photos].reverse().map((photo) => (
                <motion.div
                  key={photo.id}
                  className="absolute left-0 top-0"
                  style={{ zIndex: photo.zIndex }}
                  variants={photoVariants}
                  custom={{ x: isMobile ? photo.xMobile : photo.x, y: isMobile ? photo.yMobile : photo.y, order: photo.order }}
                >
                  <Photo width={photoSize} height={photoSize} src={photo.src} alt="Événement organisé par Kplan" direction={photo.direction} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="flex w-full justify-center">
        <Link href="/references">
          <Button
            className="rounded-full px-8 py-6 text-sm font-medium border-0"
            style={{ background: "linear-gradient(135deg, #C9A96E, #E8A0A0)", color: "#0A0C1A", minHeight: 44 }}
          >
            Voir tous nos événements →
          </Button>
        </Link>
      </div>
    </div>
  )
}

function getRandomNumberInRange(min: number, max: number): number {
  if (min >= max) throw new Error("Min value should be less than max value")
  return Math.random() * (max - min) + min
}

const MotionImage = motion(forwardRef(function MotionImage(props: ImageProps, ref: Ref<HTMLImageElement>) {
  return <Image ref={ref} {...props} />
}))

type Direction = "left" | "right"

export const Photo = ({ src, alt, className, direction, width, height }: {
  src: string; alt: string; className?: string; direction?: Direction; width: number; height: number
}) => {
  const [rotation, setRotation] = useState(0)
  const x = useMotionValue(200)
  const y = useMotionValue(200)

  useEffect(() => { setRotation(getRandomNumberInRange(1, 4) * (direction === "left" ? -1 : 1)) }, [direction])

  return (
    <motion.div
      drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      whileTap={{ scale: 1.2, zIndex: 9999 }}
      whileHover={{ scale: 1.1, rotateZ: 2 * (direction === "left" ? -1 : 1), zIndex: 9999 }}
      whileDrag={{ scale: 1.1, zIndex: 9999 }}
      initial={{ rotate: 0 }} animate={{ rotate: rotation }}
      style={{ width, height, perspective: 400, zIndex: 1, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", touchAction: "none" }}
      className={cn(className, "relative mx-auto shrink-0 cursor-grab active:cursor-grabbing")}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set(e.clientX - r.left); y.set(e.clientY - r.top) }}
      onMouseLeave={() => { x.set(200); y.set(200) }}
      draggable={false} tabIndex={0}
    >
      <div className="relative h-full w-full overflow-hidden rounded-3xl" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)" }}>
        <MotionImage className="rounded-3xl object-cover" fill src={src} alt={alt} draggable={false} />
        <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 60%)" }} />
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add components/ui/gallery.tsx package.json package-lock.json
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: add PhotoGallery component with framer-motion drag photos"
```

---

### Task 16: Transform Login Page

**Files:**
- Modify: `app/(auth)/login/login-client.tsx`

- [ ] **Step 1: Replace `login-client.tsx` with Liquid Glass version**

```tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { GlassCard } from "@/components/ui/glass-card"
import { KplanButton } from "@/components/ui/kplan-button"

type Tab = "planner" | "client"

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/dashboard"

  const [activeTab, setActiveTab] = useState<Tab>("planner")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  const canSubmit = useMemo(() => email.includes("@") && password.length >= 8, [email, password])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    setLoading(false)
    if (error) {
      const msg = error.message.includes("Invalid login credentials")
        ? "Email ou mot de passe incorrect"
        : error.message.includes("Too many requests")
        ? "Trop de tentatives. Veuillez patienter"
        : error.message
      setError(msg)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    await new Promise((r) => setTimeout(r, 100))
    router.replace(next)
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 text-center">
          <span
            className="text-5xl font-bold"
            style={{ fontFamily: "var(--font-dancing)", background: "linear-gradient(135deg, #C9A96E, #E8A0A0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            K
          </span>
          <p className="mt-2 text-sm uppercase tracking-widest text-white/40">Kplan</p>
        </div>

        {/* Glass tab switcher */}
        <div
          className="mb-4 flex rounded-full p-1"
          style={{ backdropFilter: "blur(12px) saturate(160%)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
          role="tablist"
          aria-label="Type de connexion"
        >
          {(["planner", "client"] as Tab[]).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                onClick={() => { setActiveTab(tab); setError(null) }}
                className="flex-1 rounded-full py-2 text-sm font-medium transition-all duration-200"
                style={{
                  minHeight: 44,
                  background: isActive ? "linear-gradient(135deg, #C9A96E, #E8A0A0)" : "transparent",
                  color: isActive ? "#0A0C1A" : "rgba(255,255,255,0.50)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab === "planner" ? "Connexion Planner" : "Accès Client"}
              </button>
            )
          })}
        </div>

        {activeTab === "planner" ? (
          <GlassCard className={shake ? "shake" : ""}>
            <h1 className="mb-6 text-xl font-semibold text-white/95">Connexion Planner</h1>

            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/40">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  required
                  className="border-white/12 bg-white/8 text-white placeholder:text-white/30 focus-visible:ring-[rgba(201,169,110,0.35)]"
                  style={{ borderColor: error ? "rgba(239,68,68,0.5)" : undefined }}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/40">
                  Mot de passe
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="border-white/12 bg-white/8 text-white placeholder:text-white/30 focus-visible:ring-[rgba(201,169,110,0.35)]"
                  style={{ borderColor: error ? "rgba(239,68,68,0.5)" : undefined }}
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <KplanButton type="submit" disabled={!canSubmit} loading={loading} className="mt-2 w-full">
                Se connecter
              </KplanButton>
            </form>

            <div className="mt-5 text-center">
              <Link href="/forgot-password" className="text-sm text-white/40 transition-colors hover:text-kplan-gold">
                Mot de passe oublié ?
              </Link>
            </div>
          </GlassCard>
        ) : (
          <GlassCard>
            <h1 className="mb-4 text-xl font-semibold text-white/95">Accès Client</h1>
            <p className="mb-6 text-sm text-white/50">
              Votre planner vous a envoyé un lien d&apos;invitation par email. Connectez-vous via ce lien ou accédez à votre espace ci-dessous.
            </p>
            <Link href="/client/login">
              <KplanButton variant="glass" className="w-full">
                Accéder à mon espace client →
              </KplanButton>
            </Link>
          </GlassCard>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add "app/(auth)/login/login-client.tsx"
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: liquid glass transform for planner login page"
```

---

### Task 17: Transform Landing Page + PhotoGallery

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Replace `app/(public)/page.tsx` with Liquid Glass version**

```tsx
"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { CalendarDays, Users, QrCode, LayoutGrid, Bell, ClipboardCheck, ArrowRight, CheckCircle2 } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { KplanButton } from "@/components/ui/kplan-button"
import { PhotoGallery } from "@/components/ui/gallery"

const features = [
  { icon: CalendarDays, title: "Gestion d'événements", description: "Créez et gérez vos événements de A à Z. Timeline, budget, prestataires — tout au même endroit." },
  { icon: Users,        title: "Portail client collaboratif", description: "Vos clients proposent des invités et modifications, validées par vous sous 4h via un SLA intégré." },
  { icon: LayoutGrid,   title: "Plan de table interactif", description: "Placez vos invités par glisser-déposer sur mobile ou desktop. Visualisez en 3D avant le jour J." },
  { icon: QrCode,       title: "Check-in Jour J", description: "Scannez les QR codes des invités à l'entrée. Dashboard temps réel des arrivées." },
  { icon: Bell,         title: "Notifications temps réel", description: "Soyez alerté instantanément des nouvelles demandes et rappels grâce à Supabase Realtime." },
  { icon: ClipboardCheck, title: "Checklist Jour J", description: "Liste de tâches chronologique avec assignation par équipier. Suivi en direct." },
]

const steps = [
  { step: "01", title: "Créez votre événement", description: "Définissez la date, le lieu, le budget et les détails en quelques clics." },
  { step: "02", title: "Invitez et collaborez",  description: "Partagez un lien client pour que vos clients proposent invités et modifications." },
  { step: "03", title: "Gérez le Jour J",        description: "Scannez les QR codes, suivez les arrivées et cochez vos tâches depuis votre mobile." },
]

const stats = [
  { value: 500,  suffix: "+", label: "événements gérés" },
  { value: 4,    suffix: "h", label: "SLA garanti" },
  { value: 98,   suffix: "%", label: "satisfaction client" },
]

function AnimatedStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      let start = 0
      const step = value / 40
      const timer = setInterval(() => {
        start += step
        if (start >= value) { setCount(value); clearInterval(timer) }
        else setCount(Math.floor(start))
      }, 30)
    }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl font-bold md:text-5xl" style={{ background: "linear-gradient(135deg, #ffffff, #C9A96E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        {count}{suffix}
      </div>
      <div className="mt-1 text-sm text-white/50">{label}</div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ─── Navbar ─── */}
      <header className="sticky top-0 z-50 border-b border-white/8 backdrop-blur-[40px]" style={{ background: "rgba(10,12,26,0.7)" }}>
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            Kplan
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <KplanButton variant="ghost-gold" size="sm">Connexion</KplanButton>
            </Link>
            <Link href="/login">
              <KplanButton variant="gold" size="sm">
                Commencer <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </KplanButton>
            </Link>
          </div>
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center md:py-36">
        <div className="mb-4 inline-flex items-center rounded-full border border-kplan-gold/30 bg-kplan-gold/10 px-4 py-1.5 text-xs font-medium text-kplan-gold">
          ✦ Gestion d'événements premium
        </div>
        <h1
          className="mb-6 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent md:text-7xl"
          style={{ backgroundImage: "linear-gradient(160deg, #ffffff 0%, #C9A96E 50%, #E8A0A0 100%)", letterSpacing: "-2px" }}
        >
          Organisez sans{" "}
          <span style={{ fontFamily: "var(--font-dancing)", fontStyle: "italic", color: "#C9A96E", WebkitTextFillColor: "#C9A96E" }}>
            stress
          </span>
        </h1>
        <p className="mb-10 max-w-2xl text-lg leading-relaxed text-white/65">
          La plateforme tout-en-un pour les wedding planners et organisateurs d'événements professionnels.
          Clients, invités, plan de table, Jour J — tout centralisé.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/login">
            <KplanButton variant="gold" size="lg">
              Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
            </KplanButton>
          </Link>
          <Link href="/login">
            <KplanButton variant="glass" size="lg">Voir la démo</KplanButton>
          </Link>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="mx-auto w-full max-w-3xl px-6 py-12">
        <GlassCard variant="strong" className="grid grid-cols-3 gap-8 py-8">
          {stats.map((s) => <AnimatedStat key={s.label} {...s} />)}
        </GlassCard>
      </section>

      {/* ─── Features ─── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-white/95 md:text-4xl">Tout ce dont vous avez besoin</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <GlassCard key={f.title} hover className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kplan-gold/15">
                <f.icon className="h-5 w-5 text-kplan-gold" />
              </div>
              <h3 className="font-semibold text-white/95">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{f.description}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ─── PhotoGallery ─── */}
      <section className="mx-auto max-w-6xl px-6 py-8">
        <PhotoGallery animationDelay={0.3} />
      </section>

      {/* ─── Comment ça marche ─── */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-white/95 md:text-4xl">Comment ça marche</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <GlassCard key={s.step} className="text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-[#0A0C1A]" style={{ background: "linear-gradient(135deg, #C9A96E, #E8A0A0)" }}>
                {s.step}
              </div>
              <h3 className="mb-2 font-semibold text-white/95">{s.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{s.description}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ─── Pourquoi Kplan ─── */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="mb-10 text-center text-3xl font-bold text-white/95 md:text-4xl">Pourquoi choisir Kplan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "SLA 4h garanti sur les demandes client",
            "Plan de table 3D avec drag-and-drop",
            "QR code unique par invité",
            "Dashboard temps réel le jour J",
            "Notifications instantanées (Realtime)",
            "100% responsive, conçu pour mobile",
            "Collaboration planner-client fluide",
            "Hébergé sur Supabase, rapide et sécurisé",
          ].map((item) => (
            <GlassCard key={item} padding="sm" className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-kplan-sage" />
              <span className="text-sm font-medium text-white/80">{item}</span>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white/95 md:text-4xl">Prêt à simplifier vos événements ?</h2>
          <p className="mb-8 text-lg text-white/55">
            Rejoignez les organisateurs qui gèrent leurs événements avec sérénité grâce à Kplan.
          </p>
          <Link href="/login">
            <KplanButton variant="gold" size="lg">
              Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
            </KplanButton>
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/8 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="text-sm text-white/30">&copy; {new Date().getFullYear()} Kplan. Tous droits réservés.</div>
          <Link href="/login" className="text-sm text-white/30 transition-colors hover:text-white/60">Connexion</Link>
        </div>
      </footer>
    </div>
  )
}
```

> **Note:** This page is now a Client Component (`"use client"`) because of `AnimatedStat` which uses `useEffect`/`useRef`. If SSR is needed, extract `AnimatedStat` + `PhotoGallery` into a separate client component and keep the page as a Server Component.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Build check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx next build 2>&1 | tail -15
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add "app/(public)/page.tsx"
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: liquid glass transform for landing page + PhotoGallery + animated stats"
```

---

### Task 18: Transform Planner Navbar

**Files:**
- Modify: `components/planner-navbar.tsx`

- [ ] **Step 1: Update `components/planner-navbar.tsx` with glass styling**

Change the `<nav>` opening tag from:
```tsx
<nav className="border-b border-border bg-background">
```
To:
```tsx
<nav className="sticky top-0 z-50 border-b border-white/8 backdrop-blur-[40px]" style={{ background: "rgba(10,12,26,0.75)" }}>
```

Change the logo from:
```tsx
<span className="text-xl font-bold text-foreground">Kplan</span>
```
To:
```tsx
<span className="text-xl font-bold" style={{ background: "linear-gradient(135deg, #C9A96E, #ffffff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
  Kplan
</span>
```

Update inactive nav link style from plain text to `text-white/55 hover:text-white/90` and active link to `text-kplan-gold font-medium`.

- [ ] **Step 2: TypeScript check + build check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add components/planner-navbar.tsx
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: liquid glass transform for planner navbar"
```

---

### Task 19: Dashboard Planner — Glass KPI Cards

**Files:**
- Modify: `app/(planner)/dashboard/page.tsx`
- Modify or Create: `app/(planner)/dashboard/dashboard-stats.tsx` (existing component)

- [ ] **Step 1: Check current `dashboard-stats.tsx` structure**

```bash
cat /Users/A.BEYE/KPLAN/kplan/app/\(planner\)/dashboard/dashboard-stats.tsx
```

- [ ] **Step 2: Wrap existing stats with `GlassCard`**

In `dashboard-stats.tsx`, import `GlassCard` and `SkeletonCard`, then replace each plain `<Card>` with `<GlassCard>`. For loading states, replace plain skeletons with `<SkeletonCard />`.

Pattern to follow (adapt to the actual component structure found in Step 1):
```tsx
// Before:
<Card className="p-4">
  <CardTitle>Events</CardTitle>
  <div className="text-3xl font-bold">{count}</div>
</Card>

// After:
<GlassCard hover>
  <p className="text-xs font-medium uppercase tracking-widest text-white/40">Événements actifs</p>
  <div className="mt-1 text-3xl font-bold text-white/95">{count}</div>
</GlassCard>
```

- [ ] **Step 3: Update `app/(planner)/dashboard/page.tsx`** — apply glass heading:

```tsx
// Add this welcome header above <DashboardStats />:
<div className="mb-6">
  <h1 className="text-2xl font-bold text-white/95">
    Bonjour{" "}
    <span style={{ fontFamily: "var(--font-dancing)", color: "var(--kplan-gold)", fontSize: "1.5em", lineHeight: 1 }}>
      Planner
    </span>{" "}
    👋
  </h1>
  <p className="text-sm text-white/45">
    {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
  </p>
</div>
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 5: Build check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx next build 2>&1 | tail -15
```
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add "app/(planner)/dashboard/"
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: liquid glass KPI cards and welcome header on planner dashboard"
```

---

### Task 20: Glass Transforms — Events List, DayOf, Client Event Pages

**Files:**
- Modify: `app/(planner)/events/page.tsx` — glass card per event row
- Modify: `app/(planner)/dayof/[eventId]/dayof-dashboard.tsx` — high-contrast glass for Jour J
- Modify: `app/client/[eventId]/layout.tsx` *(from Chunk 2, Task 8)* — glass nav already planned

- [ ] **Step 1: Apply `GlassCard` to planner events list**

In `app/(planner)/events/page.tsx`, replace each event's plain card/row with:
```tsx
<GlassCard hover key={event.id} className="flex items-center justify-between gap-4">
  <div>
    <h3 className="font-semibold text-white/95">{event.title}</h3>
    <p className="text-sm text-white/45">{/* date */}</p>
  </div>
  <StatusBadge status={/* map event status */} />
</GlassCard>
```

- [ ] **Step 2: Apply glass to DayOf dashboard**

In `app/(planner)/dayof/[eventId]/dayof-dashboard.tsx`, replace Card imports with GlassCard. Apply stronger contrast (`variant="strong"`) for outdoor readability. Search input: increase to `h-14` (56px touch target). Scan button: use `KplanButton variant="gold"` with camera icon.

- [ ] **Step 3: Apply glass to client event layout (already planned in Task 8, Chunk 2)**

The `app/client/[eventId]/layout.tsx` created in Chunk 2 should already use the glass navbar pattern. If not, update its `<nav>` to match the glass treatment from Task 18.

- [ ] **Step 4: Full TypeScript check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx tsc --noEmit
```

- [ ] **Step 5: Full test suite**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx vitest run
```
Expected: All tests pass (glass components have no logic to test; passing build confirms no TS errors).

- [ ] **Step 6: Final build check**

```bash
cd /Users/A.BEYE/KPLAN/kplan && export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && npx next build 2>&1 | tail -15
```
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git -C /Users/A.BEYE/KPLAN/kplan add -A
git -C /Users/A.BEYE/KPLAN/kplan commit -m "feat: apply liquid glass to events list, dayof dashboard, and client event pages"
```

---

## Manual Visual QA Checklist — Liquid Glass

After Chunk 4 is complete, verify visually (with the dev server on port 3001):

- [ ] Landing page: deep space background visible, 3 animated orbs floating, glass feature cards
- [ ] Landing page: PhotoGallery loads with fan animation, photos are draggable
- [ ] Landing page: stat counters animate when scrolled into view
- [ ] Login page: glass card centered, gold focus ring on inputs, shake on wrong password
- [ ] Planner navbar: frosted glass effect, Kplan gradient logo
- [ ] Dashboard: glass KPI cards with shimmer loading state, welcome header with Dancing Script
- [ ] `prefers-reduced-motion`: all animations disabled (test via Chrome DevTools)
- [ ] Touch targets: all buttons ≥ 44px height
- [ ] Contrast: text on glass cards passes WCAG AA (check with DevTools accessibility)
