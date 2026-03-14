"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/components/ui/glass-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import BackButton from "@/components/back-button"
import HomeButton from "@/components/home-button"

type EventRow = {
  id: string
  title: string
  status: string
  type: string
  start_at: string
  venue_name?: string
  venue_address?: string
  created_at: string
  client_access?: null | { client_token: string; expires_at: string | null }
}

type EventFormData = {
  title: string
  type: string
  start_at: string
  venue_name: string
  venue_address: string
  status: "draft" | "published" | "cancelled" | "completed"
}

const defaultFormData: EventFormData = {
  title: "",
  type: "other",
  start_at: "",
  venue_name: "",
  venue_address: "",
  status: "draft",
}

export default function EventsTableEnhanced() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [formData, setFormData] = useState<EventFormData>(defaultFormData)
  const [submitting, setSubmitting] = useState(false)

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

  async function handleCreate() {
    setSubmitting(true)
    const res = await fetch("/api/planner/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formData),
    })
    setSubmitting(false)

    if (res.ok) {
      toast.success("Événement créé avec succès")
      setCreateOpen(false)
      setFormData(defaultFormData)
      await reload()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data?.error || "Erreur lors de la création")
    }
  }

  async function handleUpdate() {
    if (!selectedEvent) return
    setSubmitting(true)
    const res = await fetch(`/api/planner/events/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formData),
    })
    setSubmitting(false)

    if (res.ok) {
      toast.success("Événement modifié avec succès")
      setEditOpen(false)
      setSelectedEvent(null)
      setFormData(defaultFormData)
      await reload()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data?.error || "Erreur lors de la modification")
    }
  }

  async function handleDelete() {
    if (!selectedEvent) return
    setSubmitting(true)
    const res = await fetch(`/api/planner/events/${selectedEvent.id}`, {
      method: "DELETE",
    })
    setSubmitting(false)

    if (res.ok) {
      toast.success("Événement supprimé")
      setDeleteOpen(false)
      setSelectedEvent(null)
      await reload()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data?.error || "Erreur lors de la suppression")
    }
  }

  function openEdit(event: EventRow) {
    setSelectedEvent(event)
    setFormData({
      title: event.title,
      type: event.type,
      start_at: event.start_at,
      venue_name: event.venue_name || "",
      venue_address: event.venue_address || "",
      status: event.status as any,
    })
    setEditOpen(true)
  }

  function openDelete(event: EventRow) {
    setSelectedEvent(event)
    setDeleteOpen(true)
  }

  return (
    <>
      <GlassCard>
        <div className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-white/95">Événements</h2>
              <p className="text-sm text-white/45">Gérez tous vos événements (création, modification, suppression).</p>
            </div>
            <div className="flex gap-2">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>Nouvel événement</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Créer un événement</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <div>
                      <label className="text-sm font-medium">Titre *</label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Nom de l'événement"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Type</label>
                        <Input
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          placeholder="mariage, anniversaire, etc."
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Statut</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="draft">Brouillon</option>
                          <option value="published">Publié</option>
                          <option value="cancelled">Annulé</option>
                          <option value="completed">Terminé</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Date et heure *</label>
                      <Input
                        type="datetime-local"
                        value={formData.start_at}
                        onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Lieu</label>
                      <Input
                        value={formData.venue_name}
                        onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                        placeholder="Nom du lieu"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Adresse</label>
                      <Input
                        value={formData.venue_address}
                        onChange={(e) => setFormData({ ...formData, venue_address: e.target.value })}
                        placeholder="Adresse complète"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>
                      Annuler
                    </Button>
                    <Button onClick={handleCreate} disabled={!formData.title || !formData.start_at || submitting}>
                      {submitting ? "Création..." : "Créer"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <HomeButton />
              <BackButton />
            </div>
          </div>
        </div>
        <div>
          {loading ? (
            <div className="text-sm text-white/45">Chargement…</div>
          ) : error ? (
            <div className="text-sm text-red-400">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-white/45">Aucun événement. Créez-en un pour commencer !</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titre</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Lieu</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Accès</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{e.title}</div>
                        <div className="text-xs text-muted-foreground">{e.type}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(e.start_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{e.venue_name || "—"}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={
                            e.status === "published"
                              ? "active"
                              : e.status === "cancelled"
                              ? "cancelled"
                              : e.status === "completed"
                              ? "completed"
                              : "pending"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/events/${e.id}`}>Planner</Link>
                          </Button>
                          {e.client_access?.client_token && (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/c/${e.client_access.client_token}/guests`}>Client</Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                            Modifier
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openDelete(e)}>
                            Supprimer
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </GlassCard>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier l'événement</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Titre *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Nom de l'événement"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <Input
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="mariage, anniversaire, etc."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Statut</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="draft">Brouillon</option>
                  <option value="published">Publié</option>
                  <option value="cancelled">Annulé</option>
                  <option value="completed">Terminé</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Date et heure *</label>
              <Input
                type="datetime-local"
                value={formData.start_at}
                onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Lieu</label>
              <Input
                value={formData.venue_name}
                onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                placeholder="Nom du lieu"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Adresse</label>
              <Input
                value={formData.venue_address}
                onChange={(e) => setFormData({ ...formData, venue_address: e.target.value })}
                placeholder="Adresse complète"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.title || !formData.start_at || submitting}>
              {submitting ? "Modification..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer l'événement <strong>{selectedEvent?.title}</strong> ? Cette action
            supprimera également tous les invités, demandes et passes QR associés.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
