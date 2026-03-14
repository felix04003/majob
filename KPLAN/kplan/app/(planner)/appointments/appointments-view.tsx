"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { useRealtimeTable } from "@/hooks/use-realtime"

/* ---------- types ---------- */

interface Appointment {
  id: string
  event_id: string
  title: string
  start_at: string
  duration_minutes: number
  location: string | null
  notes: string | null
  appointment_type: string
  attendees: string | null
  created_at: string
  updated_at: string
}

interface EventOption {
  id: string
  title: string
}

const TYPE_LABELS: Record<string, string> = {
  rdv_client: "RDV Client",
  prestataire: "Prestataire",
  visite_lieu: "Visite lieu",
  degustation: "Dégustation",
  other: "Autre",
}

const TYPE_COLORS: Record<string, string> = {
  rdv_client: "bg-blue-500",
  prestataire: "bg-purple-500",
  visite_lieu: "bg-green-500",
  degustation: "bg-orange-500",
  other: "bg-gray-400",
}

/* ---------- helpers ---------- */

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })
}

/** Get the Monday of the week containing the given date */
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday=0 offset
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get array of 7 dates starting from Monday */
function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7h-20h

/* ---------- component ---------- */

export default function AppointmentsView() {
  const [events, setEvents] = useState<EventOption[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>("all")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  // Calendar state
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [weekStart, setWeekStart] = useState(getWeekStart(today))

  // Dialog states
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Appointment | null>(null)
  const [detailItem, setDetailItem] = useState<Appointment | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState("")
  const [formDate, setFormDate] = useState("")
  const [formTime, setFormTime] = useState("10:00")
  const [formDuration, setFormDuration] = useState("60")
  const [formLocation, setFormLocation] = useState("")
  const [formType, setFormType] = useState("other")
  const [formNotes, setFormNotes] = useState("")
  const [formAttendees, setFormAttendees] = useState("")
  const [formEventId, setFormEventId] = useState("")
  const [saving, setSaving] = useState(false)

  /* ---------- load events list ---------- */

  useEffect(() => {
    fetch("/api/planner/events", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const evts = (d.events ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          title: e.title as string,
        }))
        setEvents(evts)
        if (evts.length > 0 && !formEventId) setFormEventId(evts[0].id)
      })
      .catch(console.error)
  }, [])

  /* ---------- load appointments ---------- */

  const loadAppointments = useCallback(async () => {
    setLoading(true)
    try {
      if (selectedEventId === "all") {
        const res = await fetch("/api/planner/events", { cache: "no-store" })
        const d = await res.json()
        const allEvts = d.events ?? []
        const allAppts: Appointment[] = []
        await Promise.all(
          allEvts.map(async (e: Record<string, unknown>) => {
            const r = await fetch(
              `/api/planner/events/${e.id}/appointments`,
              { cache: "no-store" },
            )
            const ad = await r.json()
            ;(ad.appointments ?? []).forEach((a: Appointment) =>
              allAppts.push(a),
            )
          }),
        )
        allAppts.sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
        )
        setAppointments(allAppts)
      } else {
        const res = await fetch(
          `/api/planner/events/${selectedEventId}/appointments`,
          { cache: "no-store" },
        )
        const d = await res.json()
        setAppointments(d.appointments ?? [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Realtime: auto-refresh when appointments change
  useRealtimeTable({
    table: "appointments",
    event: "*",
    onchange: () => {
      setTimeout(loadAppointments, 300)
    },
  })

  /* ---------- calendar data ---------- */

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    appointments.forEach((a) => {
      const key = new Date(a.start_at).toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    })
    return map
  }, [appointments])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1 // Monday start
    const total = daysInMonth(calYear, calMonth)
    const days: (number | null)[] = []
    for (let i = 0; i < offset; i++) days.push(null)
    for (let d = 1; d <= total; d++) days.push(d)
    return days
  }, [calYear, calMonth])

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  /* ---------- form helpers ---------- */

  const resetForm = () => {
    setFormTitle("")
    setFormDate("")
    setFormTime("10:00")
    setFormDuration("60")
    setFormLocation("")
    setFormType("other")
    setFormNotes("")
    setFormAttendees("")
    if (events.length > 0) setFormEventId(events[0].id)
  }

  const openCreate = (date?: string) => {
    resetForm()
    if (date) setFormDate(date)
    setEditItem(null)
    setShowCreate(true)
  }

  const openEdit = (a: Appointment) => {
    const d = new Date(a.start_at)
    setFormTitle(a.title)
    setFormDate(d.toISOString().slice(0, 10))
    setFormTime(
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    )
    setFormDuration(String(a.duration_minutes))
    setFormLocation(a.location ?? "")
    setFormType(a.appointment_type)
    setFormNotes(a.notes ?? "")
    setFormAttendees(a.attendees ?? "")
    setFormEventId(a.event_id)
    setEditItem(a)
    setShowCreate(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || !formDate || !formEventId) {
      toast.error("Titre, date et événement requis")
      return
    }
    setSaving(true)
    try {
      const startAt = new Date(`${formDate}T${formTime}:00`).toISOString()
      const payload = {
        title: formTitle.trim(),
        start_at: startAt,
        duration_minutes: parseInt(formDuration) || 60,
        location: formLocation.trim() || null,
        notes: formNotes.trim() || null,
        appointment_type: formType,
        attendees: formAttendees.trim() || null,
      }

      if (editItem) {
        const res = await fetch(
          `/api/planner/events/${editItem.event_id}/appointments/${editItem.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success("Rendez-vous modifié")
      } else {
        const res = await fetch(
          `/api/planner/events/${formEventId}/appointments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success("Rendez-vous créé")
      }
      setShowCreate(false)
      loadAppointments()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (a: Appointment) => {
    if (!confirm("Supprimer ce rendez-vous ?")) return
    try {
      const res = await fetch(
        `/api/planner/events/${a.event_id}/appointments/${a.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Rendez-vous supprimé")
      setDetailItem(null)
      loadAppointments()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur"
      toast.error(msg)
    }
  }

  /* ---------- helpers ---------- */
  const eventName = (eventId: string) =>
    events.find((e) => e.id === eventId)?.title ?? "—"

  const upcomingAppointments = useMemo(() => {
    const now = new Date()
    return appointments.filter((a) => new Date(a.start_at) >= now)
  }, [appointments])

  /* ---------- navigation ---------- */

  const goToToday = () => {
    const now = new Date()
    setCalYear(now.getFullYear())
    setCalMonth(now.getMonth())
    setWeekStart(getWeekStart(now))
  }

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11)
      setCalYear(calYear - 1)
    } else {
      setCalMonth(calMonth - 1)
    }
  }

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0)
      setCalYear(calYear + 1)
    } else {
      setCalMonth(calMonth + 1)
    }
  }

  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const monthLabel = new Date(calYear, calMonth).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  })

  const weekLabel = (() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const startStr = weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    const endStr = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    return `${startStr} – ${endStr}`
  })()

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()

  /* ---------- render ---------- */

  return (
    <>
      {/* Event filter */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          <span className="text-sm font-medium text-muted-foreground">
            Événement :
          </span>
          <Button
            size="sm"
            variant={selectedEventId === "all" ? "secondary" : "outline"}
            onClick={() => setSelectedEventId("all")}
          >
            Tous
          </Button>
          {events.map((e) => (
            <Button
              key={e.id}
              size="sm"
              variant={selectedEventId === e.id ? "secondary" : "outline"}
              onClick={() => setSelectedEventId(e.id)}
            >
              {e.title}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="calendar">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="calendar">Mois</TabsTrigger>
            <TabsTrigger value="week">Semaine</TabsTrigger>
            <TabsTrigger value="list">Liste</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              <CalendarDays className="mr-1 h-4 w-4" />
              Aujourd&apos;hui
            </Button>
            <Button onClick={() => openCreate()}>+ Nouveau RDV</Button>
          </div>
        </div>

        {/* ========== MONTH VIEW ========== */}
        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="capitalize">{monthLabel}</CardTitle>
                <Button variant="outline" size="icon" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Weekday headers */}
              <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(
                  (d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ),
                )}
              </div>
              {/* Days grid */}
              <div className="grid grid-cols-7 gap-px">
                {calendarDays.map((day, i) => {
                  if (day === null) {
                    return <div key={`empty-${i}`} className="min-h-16 md:min-h-20" />
                  }
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  const dayAppts = appointmentsByDate.get(dateStr) ?? []
                  const isDayToday =
                    day === today.getDate() &&
                    calMonth === today.getMonth() &&
                    calYear === today.getFullYear()

                  return (
                    <div
                      key={dateStr}
                      className={`min-h-16 md:min-h-20 cursor-pointer rounded-md border p-1 transition-colors hover:bg-muted/50 ${isDayToday ? "border-primary bg-primary/5 ring-1 ring-primary/30" : ""}`}
                      onClick={() => openCreate(dateStr)}
                    >
                      <div
                        className={`text-right text-xs font-medium ${isDayToday ? "text-primary font-bold" : "text-muted-foreground"}`}
                      >
                        {day}
                      </div>
                      <div className="mt-0.5 flex flex-col gap-0.5">
                        {dayAppts.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight text-white cursor-pointer ${TYPE_COLORS[a.appointment_type] ?? TYPE_COLORS.other}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetailItem(a)
                            }}
                            title={`${formatTime(a.start_at)} ${a.title}`}
                          >
                            <span className="hidden sm:inline">{formatTime(a.start_at)} </span>
                            {a.title}
                          </div>
                        ))}
                        {dayAppts.length > 2 && (
                          <div className="text-[10px] text-muted-foreground text-center">
                            +{dayAppts.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS[key]}`}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== WEEK VIEW ========== */}
        <TabsContent value="week">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" onClick={prevWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-sm md:text-base">{weekLabel}</CardTitle>
                <Button variant="outline" size="icon" onClick={nextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Day headers */}
                <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
                  <div /> {/* empty corner */}
                  {weekDays.map((d) => {
                    const dateStr = d.toISOString().slice(0, 10)
                    const dayAppts = appointmentsByDate.get(dateStr) ?? []
                    return (
                      <div
                        key={dateStr}
                        className={`border-l px-2 py-2 text-center ${isToday(d) ? "bg-primary/5" : ""}`}
                      >
                        <div className="text-xs text-muted-foreground">
                          {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                        </div>
                        <div
                          className={`text-lg font-bold ${isToday(d) ? "text-primary" : ""}`}
                        >
                          {d.getDate()}
                        </div>
                        {dayAppts.length > 0 && (
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            {dayAppts.length}
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Hour rows */}
                <div className="relative">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-14"
                    >
                      <div className="flex items-start justify-end pr-2 pt-1 text-xs text-muted-foreground">
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      {weekDays.map((d) => {
                        const dateStr = d.toISOString().slice(0, 10)
                        const dayAppts = appointmentsByDate.get(dateStr) ?? []
                        const hourAppts = dayAppts.filter((a) => {
                          const h = new Date(a.start_at).getHours()
                          return h === hour
                        })

                        return (
                          <div
                            key={`${dateStr}-${hour}`}
                            className={`border-l p-0.5 cursor-pointer hover:bg-muted/30 transition-colors ${isToday(d) ? "bg-primary/[0.02]" : ""}`}
                            onClick={() => {
                              const timeStr = `${String(hour).padStart(2, "0")}:00`
                              resetForm()
                              setFormDate(dateStr)
                              setFormTime(timeStr)
                              setEditItem(null)
                              setShowCreate(true)
                            }}
                          >
                            {hourAppts.map((a) => (
                              <div
                                key={a.id}
                                className={`mb-0.5 truncate rounded px-1.5 py-1 text-[11px] leading-tight text-white cursor-pointer ${TYPE_COLORS[a.appointment_type] ?? TYPE_COLORS.other}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDetailItem(a)
                                }}
                                title={`${a.title} (${a.duration_minutes}min)`}
                              >
                                <div className="font-medium truncate">{a.title}</div>
                                <div className="opacity-80">
                                  {formatTime(a.start_at)} · {a.duration_minutes}min
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== LIST TAB ========== */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>
                Prochains rendez-vous ({upcomingAppointments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              )}
              {!loading && upcomingAppointments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucun rendez-vous à venir.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {upcomingAppointments.map((a) => (
                  <div
                    key={a.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    onClick={() => setDetailItem(a)}
                  >
                    <div
                      className={`mt-1 h-3 w-3 shrink-0 rounded-full ${TYPE_COLORS[a.appointment_type] ?? TYPE_COLORS.other}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABELS[a.appointment_type] ?? a.appointment_type}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {formatDate(a.start_at)} à {formatTime(a.start_at)} •{" "}
                        {a.duration_minutes} min
                      </div>
                      {a.location && (
                        <div className="mt-0.5 text-sm text-muted-foreground truncate">
                          📍 {a.location}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {eventName(a.event_id)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========== DETAIL DIALOG ========== */}
      <Dialog
        open={!!detailItem}
        onOpenChange={() => setDetailItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailItem?.title}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>
                  {TYPE_LABELS[detailItem.appointment_type] ??
                    detailItem.appointment_type}
                </Badge>
                <Badge variant="outline">{detailItem.duration_minutes} min</Badge>
              </div>
              <div>
                <span className="font-medium">Date :</span>{" "}
                {formatDate(detailItem.start_at)} à{" "}
                {formatTime(detailItem.start_at)}
              </div>
              {detailItem.location && (
                <div>
                  <span className="font-medium">Lieu :</span>{" "}
                  {detailItem.location}
                </div>
              )}
              {detailItem.attendees && (
                <div>
                  <span className="font-medium">Participants :</span>{" "}
                  {detailItem.attendees}
                </div>
              )}
              {detailItem.notes && (
                <div>
                  <span className="font-medium">Notes :</span>{" "}
                  {detailItem.notes}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Événement : {eventName(detailItem.event_id)}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetailItem(null)
                    openEdit(detailItem)
                  }}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(detailItem)}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== CREATE / EDIT DIALOG ========== */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* Event selector */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                Événement
              </label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={formEventId}
                onChange={(e) => setFormEventId(e.target.value)}
                disabled={!!editItem}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Titre</label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: RDV traiteur"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Heure</label>
                <Input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Durée (min)
                </label>
                <Input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  min="5"
                  max="1440"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Lieu</label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="Adresse ou nom du lieu"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Participants
              </label>
              <Input
                value={formAttendees}
                onChange={(e) => setFormAttendees(e.target.value)}
                placeholder="Ex: Marie, DJ Martin"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Notes supplémentaires…"
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Enregistrement…"
                : editItem
                  ? "Enregistrer"
                  : "Créer le rendez-vous"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
