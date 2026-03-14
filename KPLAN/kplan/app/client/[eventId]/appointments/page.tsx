"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Appointment = {
  id: string
  title: string
  start_at: string
  end_at: string | null
  location: string | null
  appointment_type: "rdv_client" | "prestataire" | "visite_lieu" | "degustation" | "other"
  attendees: string[]
}

type EventData = {
  event: {
    id: string
    title: string
  }
  appointments: Appointment[]
}

const appointmentTypeLabels: Record<string, string> = {
  rdv_client: "RDV Client",
  prestataire: "Prestataire",
  visite_lieu: "Visite lieu",
  degustation: "Dégustation",
  other: "Autre",
}

function formatDuration(startAt: string, endAt: string | null): string {
  if (!endAt) return ""
  const start = new Date(startAt)
  const end = new Date(endAt)
  const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60000)

  if (diffMinutes < 60) {
    return `${diffMinutes} min`
  }

  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}min`
}

export default function ClientAppointmentsPage() {
  const params = useParams()
  const eventId = params.eventId as string

  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/client/${eventId}/appointments`, {
      cache: "no-store",
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setData(null)
      setError((json as any)?.error ?? `Erreur ${res.status}`)
      setLoading(false)
      return
    }
    setData(json as any)
    setLoading(false)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rendez-vous</CardTitle>
          <CardDescription>Chargement…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rendez-vous</CardTitle>
          <CardDescription className="text-red-600">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!data) return null

  const appointments = data.appointments || []
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>{data.event.title}</CardTitle>
          <CardDescription>Rendez-vous à venir</CardDescription>
        </CardHeader>
      </Card>

      {/* Appointments List */}
      {sortedAppointments.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Aucun rendez-vous</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedAppointments.map((appointment) => {
            const startDate = new Date(appointment.start_at)
            const duration = formatDuration(appointment.start_at, appointment.end_at)

            return (
              <Card key={appointment.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold">{appointment.title}</h3>
                      <Badge variant="outline">
                        {appointmentTypeLabels[appointment.appointment_type]}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1 text-sm">
                      <div className="text-muted-foreground">
                        {startDate.toLocaleDateString("fr-FR", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {startDate.toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {duration && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-muted-foreground">{duration}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {appointment.location && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Lieu:</span>
                        <div className="mt-1">{appointment.location}</div>
                      </div>
                    )}

                    {appointment.attendees && appointment.attendees.length > 0 && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Participants:</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {appointment.attendees.map((attendee, idx) => (
                            <Badge key={idx} variant="secondary">
                              {attendee}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
