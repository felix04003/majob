"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Mail, MessageCircle, Loader2, ShieldOff, RefreshCw, QrCode, BarChart3 } from "lucide-react"
import TasksPanel from "./tasks-panel"
import InvitationTab from "./invitation-tab"
import SeatingTab from "./seating-tab"
import ClientAccountsTab from "./client-accounts-tab"

type EventDetailResp = {
  event: { id: string; title: string; status: string; start_at: string }
  counts: { guests: number; pendingChanges: number }
}

type GuestRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  rsvp_status: string
  created_at: string
  invitation?: null | { invite_token: string; status: string; channel: string | null; sent_at: string | null }
  qr?: null | { id: string; qr_token: string; is_active: boolean; revoked_at: string | null }
}

type ChangeRow = {
  id: string
  action: "create" | "update" | "delete"
  status: string
  created_at: string
  guest_id: string | null
  comment?: string | null
  reviewed_at?: string | null
}

export default function EventDetail({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EventDetailResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending")
  const [guestQuery, setGuestQuery] = useState("")
  const [guestSort, setGuestSort] = useState<"created_desc" | "created_asc" | "name_asc" | "name_desc">("created_desc")
  const [tabError, setTabError] = useState<string | null>(null)
  const [sendingToken, setSendingToken] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [generatingPasses, setGeneratingPasses] = useState(false)
  const [passAction, setPassAction] = useState<string | null>(null)

  // IMPORTANT: hooks must be called unconditionally (Next/React rule of hooks).
  const filteredChanges = useMemo(() => {
    if (requestFilter === "all") return changes
    return changes.filter((c) => c.status === requestFilter)
  }, [changes, requestFilter])

  const filteredGuests = useMemo(() => {
    const q = guestQuery.trim().toLowerCase()
    let list = guests
    if (q) {
      list = list.filter((g) => {
        const name = `${g.first_name} ${g.last_name}`.toLowerCase()
        const contact = `${g.email ?? ""} ${g.phone ?? ""}`.toLowerCase()
        return name.includes(q) || contact.includes(q)
      })
    }
    const byName = (a: GuestRow, b: GuestRow) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    const byCreated = (a: GuestRow, b: GuestRow) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    const sorted = [...list]
    if (guestSort === "created_asc") sorted.sort(byCreated)
    if (guestSort === "created_desc") sorted.sort((a, b) => byCreated(b, a))
    if (guestSort === "name_asc") sorted.sort(byName)
    if (guestSort === "name_desc") sorted.sort((a, b) => byName(b, a))
    return sorted
  }, [guests, guestQuery, guestSort])

  function exportGuestsCsv() {
    const rows = filteredGuests.map((g) => ({
      first_name: g.first_name,
      last_name: g.last_name,
      email: g.email ?? "",
      phone: g.phone ?? "",
      rsvp_status: g.rsvp_status ?? "",
      created_at: g.created_at ?? "",
    }))
    const header = Object.keys(
      rows[0] ?? { first_name: "", last_name: "", email: "", phone: "", rsvp_status: "", created_at: "" }
    )
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [header.join(","), ...rows.map((r) => header.map((k) => escape(String((r as any)[k] ?? ""))).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `kplan-guests-${eventId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/planner/events/${encodeURIComponent(eventId)}`, { cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setData(null)
        setError((json as any)?.error ?? `Erreur ${res.status}`)
        setLoading(false)
        return
      }
      setData(json as any)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function loadGuests() {
    setTabError(null)
    const res = await fetch(`/api/planner/events/${encodeURIComponent(eventId)}/invites`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setGuests([])
      setTabError((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    setGuests(Array.isArray((json as any)?.guests) ? (json as any).guests : [])
  }
  function buildInviteMessage(inviteToken: string) {
    const title = data?.event.title ?? "Votre évènement"
    const date = data?.event.start_at ? new Date(data.event.start_at).toLocaleString() : ""
    const inviteUrl = `${location.origin}/i/${inviteToken}`
    const passUrl = `${location.origin}/p/${inviteToken}`
    return `Invitation — ${title}\n${date}\n\nRSVP: ${inviteUrl}\nPass/QR (après confirmation): ${passUrl}`
  }

  async function sendInvitation(inviteToken: string, channel: "email" | "whatsapp") {
    setSendingToken(inviteToken)
    try {
      const res = await fetch(`/api/planner/invitations/${inviteToken}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, baseUrl: location.origin }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((json as any)?.error ?? `Erreur ${res.status}`)
        return
      }
      if (channel === "whatsapp" && json.whatsappUrl) {
        window.open(json.whatsappUrl, "_blank")
      }
      toast.success(channel === "email" ? "Email envoyé !" : "WhatsApp ouvert !")
      await loadGuests()
    } catch {
      toast.error("Erreur lors de l'envoi")
    } finally {
      setSendingToken(null)
    }
  }

  async function sendAllInvitations(channel: "email" | "whatsapp") {
    setSendingAll(true)
    try {
      const res = await fetch(`/api/planner/events/${encodeURIComponent(eventId)}/send-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, baseUrl: location.origin }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((json as any)?.error ?? `Erreur ${res.status}`)
        return
      }
      if (channel === "whatsapp" && json.whatsappUrls) {
        for (const item of json.whatsappUrls) {
          window.open(item.url, "_blank")
        }
      }
      const msg = `${json.sent} envoyée(s), ${json.skipped} ignorée(s)${json.failed ? `, ${json.failed} échec(s)` : ""}`
      toast.success(msg)
      await loadGuests()
    } catch {
      toast.error("Erreur lors de l'envoi groupé")
    } finally {
      setSendingAll(false)
    }
  }

  async function generatePasses() {
    setGeneratingPasses(true)
    try {
      const res = await fetch(`/api/planner/events/${encodeURIComponent(eventId)}/generate-passes`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((json as any)?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success(`${json.generated} pass générés (${json.alreadyHad} existaient déjà)`)
      await loadGuests()
    } catch {
      toast.error("Erreur lors de la génération")
    } finally {
      setGeneratingPasses(false)
    }
  }

  async function revokePass(passId: string) {
    setPassAction(passId)
    try {
      const res = await fetch(`/api/planner/qr-passes/${encodeURIComponent(passId)}/revoke`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((json as any)?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success("Pass révoqué")
      await loadGuests()
    } catch {
      toast.error("Erreur lors de la révocation")
    } finally {
      setPassAction(null)
    }
  }

  async function regeneratePass(passId: string) {
    setPassAction(passId)
    try {
      const res = await fetch(`/api/planner/qr-passes/${encodeURIComponent(passId)}/regenerate`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((json as any)?.error ?? `Erreur ${res.status}`)
        return
      }
      toast.success("Nouveau pass généré")
      await loadGuests()
    } catch {
      toast.error("Erreur lors de la regénération")
    } finally {
      setPassAction(null)
    }
  }

  async function deleteGuest(guestId: string) {
    if (!confirm("Supprimer (soft delete) cet invité ?")) return
    setTabError(null)
    const res = await fetch(
      `/api/planner/events/${encodeURIComponent(eventId)}/guests/${encodeURIComponent(guestId)}/delete`,
      { method: "POST" }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTabError((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    toast.success("Invité supprimé")
    await loadGuests()
  }

  async function loadRequests() {
    setTabError(null)
    const res = await fetch(`/api/planner/events/${encodeURIComponent(eventId)}/requests`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setChanges([])
      setTabError((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    setChanges(Array.isArray((json as any)?.changes) ? (json as any).changes : [])
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event</CardTitle>
          <CardDescription>Chargement…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event</CardTitle>
          <CardDescription className="text-red-600">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!data) return null

  return (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <span>›</span>
        <Link href="/events" className="hover:text-foreground">Événements</Link>
        <span>›</span>
        <span className="text-foreground font-medium">{data.event.title}</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.event.title}
            <Badge variant="secondary">{data.event.status}</Badge>
          </CardTitle>
        <CardDescription>
          Date: {new Date(data.event.start_at).toLocaleString()} — ID: <code>{data.event.id}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/events">← Retour events</Link>
          </Button>
          <Button asChild>
            <Link href="/requests">Voir demandes</Link>
          </Button>
        </div>

        {tabError ? <div className="text-sm text-red-600">{tabError}</div> : null}

        <Tabs
          defaultValue="overview"
          onValueChange={(v) => {
            if (v === "guests") void loadGuests()
            if (v === "requests") void loadRequests()
          }}
        >
          <TabsList>
            <TabsTrigger value="overview">Planner</TabsTrigger>
            <TabsTrigger value="guests">Invités</TabsTrigger>
            <TabsTrigger value="requests">Demandes</TabsTrigger>
            <TabsTrigger value="tasks">Tâches</TabsTrigger>
            <TabsTrigger value="invitation">Invitation</TabsTrigger>
            <TabsTrigger value="seating">Plan de table</TabsTrigger>
            <TabsTrigger value="client">Client</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Invités (officiel)</div>
                <div className="text-lg font-semibold">{data.counts.guests}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Demandes pending</div>
                <div className="text-lg font-semibold">{data.counts.pendingChanges}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="guests">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input
                value={guestQuery}
                onChange={(e) => setGuestQuery(e.target.value)}
                placeholder="Rechercher (nom, email, phone)…"
                className="max-w-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={guestSort === "created_desc" ? "secondary" : "outline"}
                  onClick={() => setGuestSort("created_desc")}
                >
                  + récent
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={guestSort === "created_asc" ? "secondary" : "outline"}
                  onClick={() => setGuestSort("created_asc")}
                >
                  + ancien
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={guestSort === "name_asc" ? "secondary" : "outline"}
                  onClick={() => setGuestSort("name_asc")}
                >
                  Nom A→Z
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={guestSort === "name_desc" ? "secondary" : "outline"}
                  onClick={() => setGuestSort("name_desc")}
                >
                  Nom Z→A
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={exportGuestsCsv} disabled={filteredGuests.length === 0}>
                  Export CSV
                </Button>
              </div>
              {/* Envoi groupé */}
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void sendAllInvitations("email")}
                  disabled={sendingAll || guests.filter((g) => g.invitation && !g.invitation.sent_at && g.email).length === 0}
                >
                  {sendingAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Mail className="mr-1 h-3 w-3" />}
                  Envoyer toutes par email ({guests.filter((g) => g.invitation && !g.invitation.sent_at && g.email).length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void sendAllInvitations("whatsapp")}
                  disabled={sendingAll || guests.filter((g) => g.invitation && !g.invitation.sent_at && g.phone).length === 0}
                >
                  {sendingAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MessageCircle className="mr-1 h-3 w-3" />}
                  WhatsApp à tous ({guests.filter((g) => g.invitation && !g.invitation.sent_at && g.phone).length})
                </Button>
              </div>
            </div>
            {/* Passes QR + Dashboard */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void generatePasses()}
                disabled={generatingPasses || guests.filter((g) => g.rsvp_status === "yes" && !g.qr).length === 0}
              >
                {generatingPasses ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <QrCode className="mr-1 h-3 w-3" />}
                Générer les passes ({guests.filter((g) => g.rsvp_status === "yes" && !g.qr).length})
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/dayof/${eventId}`}>
                  <BarChart3 className="mr-1 h-3 w-3" />
                  Dashboard Jour-J
                </Link>
              </Button>
            </div>

            {filteredGuests.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun invité (ou non chargé).</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>RSVP</TableHead>
                    <TableHead>Invitation</TableHead>
                    <TableHead>QR</TableHead>
                    <TableHead className="text-right">Créé</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGuests.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">
                        {g.first_name} {g.last_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{g.email || g.phone || "-"}</TableCell>
                      <TableCell>{g.rsvp_status}</TableCell>
                      <TableCell>
                        {g.invitation?.invite_token ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {g.invitation.sent_at ? (
                              <Badge variant="secondary" className="text-xs">
                                {g.invitation.channel === "email" ? "📧" : g.invitation.channel === "whatsapp" ? "💬" : "✓"}{" "}
                                Envoyée
                              </Badge>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!g.email || sendingToken === g.invitation.invite_token}
                                  onClick={() => void sendInvitation(g.invitation!.invite_token, "email")}
                                  title={g.email ? `Envoyer à ${g.email}` : "Pas d'email"}
                                >
                                  {sendingToken === g.invitation.invite_token ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Mail className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!g.phone || sendingToken === g.invitation.invite_token}
                                  onClick={() => void sendInvitation(g.invitation!.invite_token, "whatsapp")}
                                  title={g.phone ? `WhatsApp ${g.phone}` : "Pas de téléphone"}
                                >
                                  <MessageCircle className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                const full = `${location.origin}/i/${g.invitation!.invite_token}`
                                await navigator.clipboard.writeText(full)
                                toast.success("Lien copié")
                              }}
                              title="Copier le lien"
                            >
                              Copier
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {g.qr?.qr_token ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={g.qr.is_active ? "secondary" : "outline"} className={`text-xs ${g.qr.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {g.qr.is_active ? "Actif" : "Révoqué"}
                            </Badge>
                            {g.qr.is_active && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={passAction === g.qr.id}
                                onClick={() => void revokePass(g.qr!.id)}
                                title="Révoquer le pass"
                              >
                                {passAction === g.qr.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={passAction === g.qr.id}
                              onClick={() => void regeneratePass(g.qr!.id)}
                              title="Regénérer le pass"
                            >
                              {passAction === g.qr.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(g.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => void deleteGuest(g.id)}>
                          Supprimer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="requests">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="text-sm text-muted-foreground">Filtre:</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={requestFilter === "pending" ? "secondary" : "outline"}
                  onClick={() => setRequestFilter("pending")}
                >
                  pending
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={requestFilter === "approved" ? "secondary" : "outline"}
                  onClick={() => setRequestFilter("approved")}
                >
                  approved
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={requestFilter === "rejected" ? "secondary" : "outline"}
                  onClick={() => setRequestFilter("rejected")}
                >
                  rejected
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={requestFilter === "all" ? "secondary" : "outline"}
                  onClick={() => setRequestFilter("all")}
                >
                  all
                </Button>
              </div>
            </div>

            {filteredChanges.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune demande (ou non chargée).</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créée</TableHead>
                    <TableHead>Revue</TableHead>
                    <TableHead>Commentaire</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChanges.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.action}</TableCell>
                      <TableCell>{c.status}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.reviewed_at ? new Date(c.reviewed_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.comment?.toString() || "—"}</TableCell>
                      <TableCell className="text-right">
                        {c.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={async () => {
                                const res = await fetch(`/api/planner/requests/${c.id}/approve`, { method: "POST" })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok) setTabError((j as any)?.error ?? `Erreur ${res.status}`)
                                await loadRequests()
                              }}
                            >
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const comment = prompt("Commentaire (obligatoire) ?")?.trim()
                                if (!comment) return
                                const res = await fetch(`/api/planner/requests/${c.id}/reject`, {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ comment }),
                                })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok) setTabError((j as any)?.error ?? `Erreur ${res.status}`)
                                await loadRequests()
                              }}
                            >
                              Refuser
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="tasks">
            <TasksPanel eventId={eventId} />
          </TabsContent>

          <TabsContent value="invitation">
            <InvitationTab eventId={eventId} />
          </TabsContent>

          <TabsContent value="seating">
            <SeatingTab eventId={eventId} />
          </TabsContent>

          <TabsContent value="client">
            <ClientAccountsTab eventId={eventId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    </>
  )
}


