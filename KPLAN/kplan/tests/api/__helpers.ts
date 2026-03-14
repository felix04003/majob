import { vi } from "vitest"

/**
 * Creates a chainable Supabase mock query builder.
 * Usage:
 *   const mock = createQueryMock({ data: [...], error: null })
 *   mock.from("table").select("*").eq("id", "x").single()
 */
export function createQueryMock(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {}

  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "is",
    "in",
    "order",
    "limit",
    "range",
    "maybeSingle",
    "single",
  ]

  for (const method of methods) {
    // single/maybeSingle terminate the chain and return the result
    if (method === "single" || method === "maybeSingle") {
      chain[method] = vi.fn(() => Promise.resolve(finalResult))
    } else {
      chain[method] = vi.fn(() => chain)
    }
  }

  return {
    from: vi.fn(() => chain),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: null }, error: null })
      ),
    },
    _chain: chain,
    _result: finalResult,
  }
}

/** Creates a minimal Request object for testing route handlers */
export function createRequest(
  url: string,
  options: RequestInit & { json?: unknown } = {}
) {
  const { json, ...init } = options
  if (json) {
    init.method = init.method ?? "POST"
    init.body = JSON.stringify(json)
    init.headers = {
      ...((init.headers as Record<string, string>) ?? {}),
      "Content-Type": "application/json",
    }
  }
  return new Request(url, init)
}
