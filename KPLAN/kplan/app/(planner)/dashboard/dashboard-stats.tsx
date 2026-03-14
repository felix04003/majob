"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRealtimeTable } from "@/hooks/use-realtime"

type DashboardStats = {
  totalEvents: number
  upcomingEvents: number
  totalGuests: number
  totalCheckins: number
  pendingRequests: number
  overdueRequests: number
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  pendingValidations: number
  upcomingAppointments: number
}

export default function DashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/planner/stats", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  // Initial load
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Realtime: refresh stats when key tables change
  useRealtimeTable({
    table: "events",
    event: "*",
    onchange: () => setTimeout(loadStats, 500),
  })

  useRealtimeTable({
    table: "guest_changes",
    event: "*",
    onchange: () => setTimeout(loadStats, 500),
  })

  useRealtimeTable({
    table: "tasks",
    event: "*",
    onchange: () => setTimeout(loadStats, 500),
  })

  useRealtimeTable({
    table: "checkins",
    event: "INSERT",
    onchange: () => setTimeout(loadStats, 500),
  })

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statistiques</CardTitle>
          <CardDescription>Vue d'ensemble de vos événements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Chargement...</div>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Statistiques
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            temps réel
          </span>
        </CardTitle>
        <CardDescription>Vue d'ensemble en temps réel</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <div className="text-sm text-muted-foreground">Événements total</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.upcomingEvents}</div>
            <div className="text-sm text-muted-foreground">À venir</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-bold">{stats.totalGuests}</div>
            <div className="text-sm text-muted-foreground">Invités total</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-bold text-green-600">{stats.totalCheckins}</div>
            <div className="text-sm text-muted-foreground">Check-ins</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{stats.pendingRequests}</div>
              {stats.overdueRequests > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {stats.overdueRequests} retard
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">Demandes en attente</div>
          </div>
        </div>

        {/* Assistant Planner Stats */}
        <div className="mt-4 border-t pt-4">
          <div className="mb-3 text-sm font-medium text-muted-foreground">Assistant Planner</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%</div>
              </div>
              <div className="text-sm text-muted-foreground">Tâches ({stats.completedTasks}/{stats.totalTasks})</div>
              {stats.totalTasks > 0 && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.overdueTasks}</div>
                {stats.overdueTasks > 0 && (
                  <Badge variant="destructive" className="text-xs">retard</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">Tâches en retard</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.pendingValidations}</div>
                {stats.pendingValidations > 0 && (
                  <Badge variant="outline" className="text-xs">en attente</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">Validations client</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.upcomingAppointments}</div>
              <div className="text-sm text-muted-foreground">RDV cette semaine</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
