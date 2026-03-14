"use client"

import { useEffect, useRef } from "react"
import { supabaseBrowser } from "@/lib/supabase/browser"
import type { RealtimeChannel } from "@supabase/supabase-js"

type PostgresEvent = "INSERT" | "UPDATE" | "DELETE" | "*"

interface UseRealtimeTableOptions {
  /** Postgres table to subscribe to */
  table: string
  /** Schema (default: "public") */
  schema?: string
  /** Event types to listen for (default: "*") */
  event?: PostgresEvent
  /** Optional filter expression, e.g. "event_id=eq.abc123" */
  filter?: string
  /** Callback fired when a matching change occurs */
  onchange: (payload: unknown) => void
  /** Set to false to disable the subscription temporarily */
  enabled?: boolean
}

/**
 * Subscribe to Supabase Realtime Postgres changes on a table.
 *
 * Usage:
 * ```ts
 * useRealtimeTable({
 *   table: "notifications",
 *   event: "INSERT",
 *   filter: "recipient_type=eq.planner",
 *   onchange: () => refetch(),
 * })
 * ```
 */
export function useRealtimeTable({
  table,
  schema = "public",
  event = "*",
  filter,
  onchange,
  enabled = true,
}: UseRealtimeTableOptions) {
  // Keep latest callback in a ref so subscription doesn't need to re-create
  const callbackRef = useRef(onchange)
  callbackRef.current = onchange

  useEffect(() => {
    if (!enabled) return

    let channel: RealtimeChannel | null = null

    try {
      const supabase = supabaseBrowser()

      const channelName = `rt:${table}:${event}:${filter ?? "all"}`

      // Build the filter config matching Supabase Realtime API
      const filterConfig: {
        event: string
        schema: string
        table: string
        filter?: string
      } = {
        event,
        schema,
        table,
      }
      if (filter) {
        filterConfig.filter = filter
      }

      channel = supabase
        .channel(channelName)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filterConfig as any,
          (payload: unknown) => {
            callbackRef.current(payload)
          },
        )
        .subscribe()
    } catch (err) {
      // Supabase client may not be initialized (missing env vars in dev)
      console.warn("[useRealtimeTable] Could not subscribe:", err)
    }

    return () => {
      if (channel) {
        try {
          supabaseBrowser().removeChannel(channel)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [table, schema, event, filter, enabled])
}
