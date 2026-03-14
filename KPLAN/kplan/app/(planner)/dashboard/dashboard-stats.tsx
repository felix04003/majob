"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { GlassCard } from "@/components/ui/glass-card"
import { SkeletonCard } from "@/components/ui/skeleton-glass"
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Realtime indicator */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          temps réel
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <GlassCard hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Événements total</p>
          <p className="mt-1 text-3xl font-bold text-white/95">{stats.totalEvents}</p>
        </GlassCard>

        <GlassCard hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">À venir</p>
          <p className="mt-1 text-3xl font-bold text-white/95">{stats.upcomingEvents}</p>
        </GlassCard>

        <GlassCard hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Invités total</p>
          <p className="mt-1 text-3xl font-bold text-white/95">{stats.totalGuests}</p>
        </GlassCard>

        <GlassCard hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Check-ins</p>
          <p className="mt-1 text-3xl font-bold text-white/95">{stats.totalCheckins}</p>
        </GlassCard>

        <GlassCard hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Demandes en attente</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-3xl font-bold text-white/95">{stats.pendingRequests}</p>
            {stats.overdueRequests > 0 && (
              <Badge variant="destructive" className="text-xs">
                {stats.overdueRequests} retard
              </Badge>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Assistant Planner Stats */}
      <div className="pt-2">
        <div className="mb-3 text-xs font-medium uppercase tracking-widest text-white/40">Assistant Planner</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <GlassCard hover>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Tâches</p>
            <p className="mt-1 text-3xl font-bold text-white/95">
              {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
            </p>
            <p className="text-xs text-white/40">({stats.completedTasks}/{stats.totalTasks})</p>
            {stats.totalTasks > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-kplan-gold transition-all" style={{ width: `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}%` }} />
              </div>
            )}
          </GlassCard>

          <GlassCard hover>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Tâches en retard</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-3xl font-bold text-white/95">{stats.overdueTasks}</p>
              {stats.overdueTasks > 0 && (
                <Badge variant="destructive" className="text-xs">retard</Badge>
              )}
            </div>
          </GlassCard>

          <GlassCard hover>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Validations client</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-3xl font-bold text-white/95">{stats.pendingValidations}</p>
              {stats.pendingValidations > 0 && (
                <Badge variant="outline" className="text-xs border-white/20 text-white/60">en attente</Badge>
              )}
            </div>
          </GlassCard>

          <GlassCard hover>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">RDV cette semaine</p>
            <p className="mt-1 text-3xl font-bold text-white/95">{stats.upcomingAppointments}</p>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
