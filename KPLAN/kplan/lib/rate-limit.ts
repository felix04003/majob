interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): { ok: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { ok: true }
  }

  if (entry.count >= options.limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { ok: true }
}

/** Réservé aux tests — vide le store en mémoire */
export function _resetStore(): void {
  store.clear()
}
