"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Users,
  UserCheck,
  Clock,
  TrendingUp,
  RefreshCw,
  QrCode,
  ArrowLeft,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/components/ui/glass-card"
import { KplanButton } from "@/components/ui/kplan-button"
import DayOfChecklist from "./dayof-checklist"
import { useRealtimeTable } from "@/hooks/use-realtime"

interface Stats {
  total_guests: number
  arrived: number
  pending: number
  rate: number
}

interface Checkin {
  id: string
  guest_id: string
  guest_name: string
  qr_token: string
  result: "valid" | "already_checked_in" | "invalid" | "revoked"
  scanned_at: string
}

interface Guest {
  id: string
  first_name: string
  last_name: string
  rsvp_status: string
  arrived: boolean
  arrived_at: string | null
}

interface DayOfDashboardProps {
  eventId: string
}

export default function DayOfDashboard({ eventId }: DayOfDashboardProps) {
  const [stats, setStats] = useState<Stats>({
    total_guests: 0,
    arrived: 0,
    pending: 0,
    rate: 0,
  })
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [eventTitle, setEventTitle] = useState("")

  const loadData = useCallback(async () => {
    try {
      // Fetch event title
      const eventRes = await fetch(`/api/planner/events/${eventId}`)
      if (eventRes.ok) {
        const eventData = await eventRes.json()
        setEventTitle(eventData.name || eventData.title || "")
      }

      // Fetch checkins, guests, and stats
      const checkinsRes = await fetch(
        `/api/planner/events/${eventId}/checkins`
      )
      if (checkinsRes.ok) {
        const data = await checkinsRes.json()

        // Process checkins
        const checkinsList = data.checkins || []
        setCheckins(checkinsList.slice(0, 20)) // Latest 20

        // Process guests (returned by the API with arrived/arrived_at)
        const guestsList = data.guests || []
        setGuests(guestsList)

        // Use API-computed stats (reliable server-side calculation)
        if (data.stats) {
          setStats({
            total_guests: data.stats.total_guests ?? 0,
            arrived: data.stats.arrived ?? 0,
            pending: data.stats.pending ?? 0,
            rate: Math.round((data.stats.rate ?? 0) * 100),
          })
        }
      }

      setLoading(false)
    } catch (error) {
      console.error("Failed to load data:", error)
      setLoading(false)
    }
  }, [eventId])

  // Initial load
  useEffect(() => {
    loadData()
  }, [loadData])

  // Realtime: auto-refresh when checkins table changes
  useRealtimeTable({
    table: "checkins",
    event: "INSERT",
    onchange: () => {
      // Instant update when a new scan happens
      setTimeout(loadData, 200)
    },
  })

  // Also listen for guest changes (RSVP updates)
  useRealtimeTable({
    table: "guests",
    event: "UPDATE",
    onchange: () => {
      setTimeout(loadData, 300)
    },
  })

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch {
      return "-"
    }
  }

  const getResultBadgeColor = (
    result: "valid" | "already_checked_in" | "invalid" | "revoked"
  ) => {
    switch (result) {
      case "valid":
        return "bg-green-100 text-green-800"
      case "already_checked_in":
        return "bg-amber-100 text-amber-800"
      case "invalid":
      case "revoked":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getResultLabel = (
    result: "valid" | "already_checked_in" | "invalid" | "revoked"
  ) => {
    switch (result) {
      case "valid":
        return "Valide"
      case "already_checked_in":
        return "Déjà scanné"
      case "invalid":
        return "Invalide"
      case "revoked":
        return "Révoqué"
      default:
        return result
    }
  }

  if (loading && checkins.length === 0 && guests.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <RefreshCw className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link href="/dayof">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {eventTitle || "Événement"}
              </h1>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                Dashboard Jour-J
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  temps réel
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Link href="/dayof">
              <KplanButton variant="gold" size="sm">
                <QrCode className="w-4 h-4 mr-2" />
                Scanner
              </KplanButton>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {/* Total invités */}
        <GlassCard variant="strong" hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Total invités</p>
          <div className="mt-1 flex items-center justify-between">
            <div className="text-3xl font-bold text-white/95">{stats.total_guests}</div>
            <Users className="w-8 h-8 text-white/30" />
          </div>
        </GlassCard>

        {/* Arrivés */}
        <GlassCard variant="strong" hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Arrivés</p>
          <div className="mt-1 flex items-center justify-between">
            <div className="text-3xl font-bold text-white/95">{stats.arrived}</div>
            <UserCheck className="w-8 h-8 text-emerald-400/60" />
          </div>
        </GlassCard>

        {/* En attente */}
        <GlassCard variant="strong" hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">En attente</p>
          <div className="mt-1 flex items-center justify-between">
            <div className="text-3xl font-bold text-white/95">{stats.pending}</div>
            <Clock className="w-8 h-8 text-amber-400/60" />
          </div>
        </GlassCard>

        {/* Taux de présence */}
        <GlassCard variant="strong" hover>
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Taux de présence</p>
          <div className="mt-1 flex items-center justify-between">
            <div className="text-3xl font-bold text-white/95">{stats.rate}%</div>
            <TrendingUp className="w-8 h-8 text-kplan-gold/60" />
          </div>
        </GlassCard>
      </div>

      {/* Arrival Progress Chart */}
      <GlassCard variant="strong" className="mb-8">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/40">Progression des arrivées</p>
        <div className="space-y-2">
          <div className="w-full bg-white/10 rounded-full h-8 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full flex items-center justify-center transition-all duration-500"
              style={{ width: `${stats.rate}%` }}
            >
              {stats.rate > 0 && (
                <span className="text-white text-sm font-semibold">
                  {stats.rate}%
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-white/45">
            {stats.arrived} sur {stats.total_guests} invités arrivés
          </p>
        </div>
      </GlassCard>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Latest Checkins */}
        <GlassCard variant="strong">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/40">Derniers scans</p>
          {checkins.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              Aucun scan pour le moment
            </p>
          ) : (
            <div className="space-y-3">
              {checkins.map((checkin) => (
                <div
                  key={checkin.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/90">
                      {checkin.guest_name}
                    </p>
                    <p className="text-xs text-white/45">
                      {formatTime(checkin.scanned_at)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={getResultBadgeColor(checkin.result)}
                  >
                    {getResultLabel(checkin.result)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Guest List */}
        <GlassCard variant="strong">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/40">Liste des invités (RSVP oui)</p>
          {guests.filter((g) => g.rsvp_status === "yes").length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              Aucun invité avec RSVP oui
            </p>
          ) : (
            <div className="space-y-2">
              {guests
                .filter((g) => g.rsvp_status === "yes")
                .map((guest) => (
                  <div
                    key={guest.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                  >
                    <p className="text-sm font-medium text-white/90">
                      {guest.first_name} {guest.last_name}
                    </p>
                    {guest.arrived ? (
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs text-emerald-400 font-medium">
                          {formatTime(guest.arrived_at || "")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-white/30" />
                        <span className="text-xs text-white/30">
                          En attente
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Checklist Jour-J */}
      <DayOfChecklist eventId={eventId} />
    </div>
  )
}
