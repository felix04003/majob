"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import BackButton from "@/components/back-button"
import HomeButton from "@/components/home-button"

type EventRow = {
  id: string
  title: string
  status: string
  type: string
  start_at: string
  created_at: string
  client_access?: null | { client_token: string; expires_at: string | null }
}

export default function EventsTable() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    setError(null)
    const res = await fetch("/api/planner/events", { cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setEvents([])
      setError((data as any)?.error ?? `Erreur ${res.status}`)
      setLoading(false)
      return
    }
    setEvents(Array.isArray((data as any)?.events) ? (data as any).events : [])
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Events</CardTitle>
            <CardDescription>Liste des events créés (triés par date de création).</CardDescription>
          </div>
          <div className="flex gap-2">
            <HomeButton />
            <BackButton />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucun event.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.title}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(e.start_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{e.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/events/${e.id}`}>Ouvrir (planner)</Link>
                      </Button>
                      {e.client_access?.client_token ? (
                        <Button asChild size="sm">
                          <Link href={`/c/${e.client_access.client_token}/guests`}>Ouvrir (client)</Link>
                        </Button>
                      ) : (
                        <Button size="sm" disabled>
                          Client indisponible
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <code>{e.id}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}


