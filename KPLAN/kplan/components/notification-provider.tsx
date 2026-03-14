"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useRealtimeTable } from "@/hooks/use-realtime"

interface NotificationContextValue {
  /** Number of unread notifications for the planner */
  unreadCount: number
  /** Force a re-fetch of the unread count */
  refresh: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  refresh: () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

/**
 * Provides a global unread-notification count for the planner.
 * Fetches once on mount, then subscribes to Supabase Realtime
 * so the count updates instantly when a new notification is
 * inserted or an existing one is marked as read.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/planner/notifications?is_read=false&limit=1", {
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      setUnreadCount(data.unread_count ?? 0)
    } catch {
      // silently ignore fetch errors
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchUnread()
  }, [fetchUnread])

  // Subscribe to realtime changes on the notifications table
  useRealtimeTable({
    table: "notifications",
    event: "*", // INSERT (new notif) or UPDATE (marked read)
    onchange: () => {
      // Small delay to let the DB commit settle
      setTimeout(fetchUnread, 300)
    },
  })

  return (
    <NotificationContext.Provider value={{ unreadCount, refresh: fetchUnread }}>
      {children}
    </NotificationContext.Provider>
  )
}
