"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useRealtimeTable } from "@/hooks/use-realtime"
import { useNotifications } from "@/components/notification-provider"

type Notification = {
  id: string
  event_id: string
  recipient_type: string
  type: string
  title: string
  message?: string | null
  related_id?: string | null
  is_read: boolean
  email_sent: boolean
  created_at: string
}

const NOTIFICATION_TYPES = {
  task_overdue: { label: "Tâche dépassée", color: "destructive" as const },
  client_commented: { label: "Commentaire client", color: "default" as const },
  client_validated: { label: "Validation client", color: "default" as const },
  client_refused: { label: "Refus client", color: "destructive" as const },
  appointment_reminder: { label: "Rappel rendez-vous", color: "secondary" as const },
  task_needs_validation: { label: "Validation requise", color: "secondary" as const },
} as const

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "à l'instant"
  if (diffMins < 60) return `il y a ${diffMins}m`
  if (diffHours < 24) return `il y a ${diffHours}h`
  if (diffDays < 7) return `il y a ${diffDays}j`
  return date.toLocaleDateString("fr-FR")
}

function getNotificationTypeInfo(type: string) {
  return NOTIFICATION_TYPES[type as keyof typeof NOTIFICATION_TYPES] || {
    label: type,
    color: "secondary" as const,
  }
}

export default function NotificationsList() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "unread">("unread")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const { refresh: refreshGlobalCount } = useNotifications()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter === "unread") {
        params.append("is_read", "false")
      }
      if (typeFilter !== "all") {
        params.append("type", typeFilter)
      }
      params.append("limit", "100")

      const res = await fetch(`/api/planner/notifications?${params.toString()}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        setNotifications([])
        toast.error("Erreur de chargement des notifications")
        setLoading(false)
        return
      }
      const data = await res.json().catch(() => ({}))
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : [])
    } catch (err) {
      toast.error("Erreur lors du chargement")
      setNotifications([])
    }
    setLoading(false)
  }, [filter, typeFilter])

  // Initial load + reload when filters change
  useEffect(() => {
    reload()
  }, [reload])

  // Realtime: auto-refresh when notifications table changes
  useRealtimeTable({
    table: "notifications",
    event: "*",
    onchange: () => {
      setTimeout(reload, 300)
    },
  })

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  )

  async function markAsRead(id: string) {
    const res = await fetch(`/api/planner/notifications/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_read: true }),
    })
    if (res.ok) {
      await reload()
      refreshGlobalCount()
    } else {
      toast.error("Erreur lors du marquage")
    }
  }

  async function markAllAsRead() {
    const res = await fetch("/api/planner/notifications/read-all", {
      method: "POST",
    })
    if (res.ok) {
      const data = await res.json()
      toast.success(`${data.count} notification(s) marquée(s) comme lue(s)`)
      await reload()
      refreshGlobalCount()
    } else {
      toast.error("Erreur lors du marquage en masse")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Notifications
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount} non lue(s)</Badge>}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            temps réel
          </span>
        </CardTitle>
        <CardDescription>Restez informé de l'évolution de vos événements et tâches.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3">
          {/* Filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm text-muted-foreground">Statut:</div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={filter === "unread" ? "default" : "outline"}
                onClick={() => setFilter("unread")}
              >
                Non lues
                {unreadCount > 0 && <Badge variant="secondary" className="ml-1">{unreadCount}</Badge>}
              </Button>
              <Button
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                onClick={() => setFilter("all")}
              >
                Toutes
              </Button>
            </div>
          </div>

          {/* Type filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm text-muted-foreground">Type:</div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={typeFilter === "all" ? "default" : "outline"}
                onClick={() => setTypeFilter("all")}
              >
                Tous les types
              </Button>
              {Object.entries(NOTIFICATION_TYPES).map(([key, { label }]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={typeFilter === key ? "default" : "outline"}
                  onClick={() => setTypeFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Mark all as read button */}
          {unreadCount > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={markAllAsRead}>
                Tout marquer comme lu
              </Button>
            </div>
          )}
        </div>

        {/* Notifications list */}
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : notifications.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {filter === "unread"
              ? "Aucune notification non lue."
              : typeFilter !== "all"
              ? "Aucune notification pour ce type."
              : "Aucune notification."}
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const typeInfo = getNotificationTypeInfo(notification.type)
              const relativeTime = getRelativeTime(notification.created_at)

              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    notification.is_read
                      ? "border-muted bg-background"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  {/* Unread indicator */}
                  {!notification.is_read && (
                    <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  )}

                  {/* Content */}
                  <div className="flex-grow min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{notification.title}</h3>
                      <Badge variant={typeInfo.color}>{typeInfo.label}</Badge>
                    </div>
                    {notification.message && (
                      <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">{relativeTime}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {!notification.is_read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markAsRead(notification.id)}
                      >
                        Marquer comme lue
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
