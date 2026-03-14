"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { useRealtimeTable } from "@/hooks/use-realtime"

type GuestChange = {
  id: string
  event_id: string
  guest_id: string | null
  action: "create" | "update" | "delete"
  status: "pending" | "approved" | "rejected" | string
  payload: Record<string, unknown>
  created_at: string
  reviewed_at?: string | null
  comment?: string | null
  event?: { id: string; title: string; start_at: string } | null
  guest?: { id: string; first_name: string; last_name: string; email: string } | null
}

const SLA_MS = 4 * 60 * 60 * 1000 // 4 hours

function slaInfo(createdAtIso: string) {
  const created = new Date(createdAtIso).getTime()
  const deadline = created + SLA_MS
  const now = Date.now()
  const remainingMs = deadline - now
  const overdue = remainingMs <= 0
  const mins = Math.max(0, Math.round(remainingMs / 60000))
  const pct = Math.max(0, Math.min(100, (remainingMs / SLA_MS) * 100))
  return { overdue, mins, deadline, remainingMs, pct }
}

function formatSlaTime(mins: number) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}h${m.toString().padStart(2, "0")}`
  }
  return `${mins}min`
}

/** Color: green >50%, yellow >25%, orange >10%, red ≤10% */
function slaColor(pct: number) {
  if (pct > 50) return "bg-emerald-100 text-emerald-800 border-emerald-300"
  if (pct > 25) return "bg-yellow-100 text-yellow-800 border-yellow-300"
  if (pct > 10) return "bg-orange-100 text-orange-800 border-orange-300"
  return "bg-red-100 text-red-800 border-red-300"
}

/** Live countdown badge for a single request */
function SlaCountdown({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000) // tick every 15s
    return () => clearInterval(t)
  }, [])

  const sla = slaInfo(createdAt)

  if (sla.overdue) {
    const overdueMin = Math.round((now - sla.deadline) / 60000)
    return (
      <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border-red-300 animate-pulse">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        −{formatSlaTime(overdueMin)}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${slaColor(sla.pct)}`}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: sla.pct > 50 ? "#059669" : sla.pct > 25 ? "#ca8a04" : sla.pct > 10 ? "#ea580c" : "#dc2626",
        }}
      />
      {formatSlaTime(sla.mins)}
    </span>
  )
}

export default function RequestsTable() {
  const [items, setItems] = useState<GuestChange[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState("")
  const [detailId, setDetailId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/planner/requests?status=${filter}`, { cache: "no-store" })
    if (!res.ok) {
      setItems([])
      setLoading(false)
      toast.error("Erreur de chargement des demandes")
      return
    }
    const data = await res.json().catch(() => ({}))
    setItems(Array.isArray(data?.changes) ? data.changes : [])
    setLoading(false)
  }, [filter])

  // Initial load + reload on filter change
  useEffect(() => {
    reload()
  }, [reload])

  // Realtime: auto-refresh when guest_changes table changes
  useRealtimeTable({
    table: "guest_changes",
    event: "*",
    onchange: () => {
      setTimeout(reload, 300)
    },
  })

  const pendingCount = useMemo(() => items.filter((c) => c.status === "pending").length, [items])
  const overdueCount = useMemo(
    () => items.filter((c) => c.status === "pending" && slaInfo(c.created_at).overdue).length,
    [items]
  )

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter((c) => {
      const eventTitle = c.event?.title?.toLowerCase() || ""
      const guestName = `${c.guest?.first_name || ""} ${c.guest?.last_name || ""}`.toLowerCase()
      const guestEmail = c.guest?.email?.toLowerCase() || ""
      const payloadStr = JSON.stringify(c.payload).toLowerCase()
      return eventTitle.includes(q) || guestName.includes(q) || guestEmail.includes(q) || payloadStr.includes(q)
    })
  }, [items, searchQuery])

  async function approve(id: string) {
    const res = await fetch(`/api/planner/requests/${id}/approve`, { method: "POST" })
    if (res.ok) {
      toast.success("Demande approuvée avec succès")
      await reload()
    } else {
      toast.error("Erreur lors de l'approbation")
    }
  }

  async function reject() {
    if (!rejectId) return
    const res = await fetch(`/api/planner/requests/${rejectId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: rejectComment }),
    })
    if (res.ok) {
      toast.success("Demande rejetée")
      setRejectId(null)
      setRejectComment("")
      await reload()
    } else {
      toast.error("Erreur lors du rejet")
    }
  }

  const detailItem = useMemo(() => items.find((i) => i.id === detailId), [items, detailId])

  return (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <span>›</span>
        <span className="text-foreground font-medium">Demandes clients</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            Demandes de modification
            {pendingCount > 0 && <Badge variant="secondary">{pendingCount} en attente</Badge>}
            {overdueCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {overdueCount} SLA dépassé{overdueCount > 1 ? "s" : ""}
              </Badge>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              temps réel
            </span>
          </CardTitle>
          <CardDescription>
            SLA : validation sous 4 h · Le timer est <strong>live</strong> et change de couleur (vert → jaune → orange → rouge).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm text-muted-foreground">Statut:</div>
              <div className="flex gap-2">
                <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>
                  En attente
                </Button>
                <Button size="sm" variant={filter === "approved" ? "default" : "outline"} onClick={() => setFilter("approved")}>
                  Approuvées
                </Button>
                <Button size="sm" variant={filter === "rejected" ? "default" : "outline"} onClick={() => setFilter("rejected")}>
                  Rejetées
                </Button>
                <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                  Toutes
                </Button>
              </div>
            </div>
            <Input
              placeholder="Rechercher par événement, invité, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {searchQuery ? "Aucun résultat pour cette recherche." : "Aucune demande."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SLA</TableHead>
                    <TableHead>Événement</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Invité</TableHead>
                    <TableHead>Créée</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const isPending = c.status === "pending"
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          {isPending ? (
                            <SlaCountdown createdAt={c.created_at} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{c.event?.title || "—"}</div>
                          {c.event?.start_at && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(c.event.start_at).toLocaleDateString()}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={c.action === "create" ? "default" : c.action === "delete" ? "destructive" : "secondary"}
                          >
                            {c.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c.action === "create" ? (
                            <div>
                              <div className="font-medium">
                                {c.payload.first_name as string} {c.payload.last_name as string}
                              </div>
                              <div className="text-xs text-muted-foreground">{c.payload.email as string}</div>
                            </div>
                          ) : c.guest ? (
                            <div>
                              <div className="font-medium">
                                {c.guest.first_name} {c.guest.last_name}
                              </div>
                              <div className="text-xs text-muted-foreground">{c.guest.email}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(c.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"
                            }
                          >
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setDetailId(c.id)}>
                              Détails
                            </Button>
                            {isPending && (
                              <>
                                <Button size="sm" onClick={() => approve(c.id)}>
                                  Approuver
                                </Button>
                                <Dialog
                                  open={rejectId === c.id}
                                  onOpenChange={(open) => {
                                    setRejectId(open ? c.id : null)
                                    setRejectComment("")
                                  }}
                                >
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="destructive">
                                      Rejeter
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Rejeter la demande</DialogTitle>
                                    </DialogHeader>
                                    <Input
                                      value={rejectComment}
                                      onChange={(e) => setRejectComment(e.target.value)}
                                      placeholder="Commentaire (obligatoire, 2-500 caractères)"
                                    />
                                    <DialogFooter>
                                      <Button variant="outline" onClick={() => setRejectId(null)}>
                                        Annuler
                                      </Button>
                                      <Button onClick={reject} disabled={rejectComment.trim().length < 2}>
                                        Confirmer le rejet
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails de la demande</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Événement</div>
                  <div className="text-sm">{detailItem.event?.title || "—"}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Action</div>
                  <Badge
                    variant={
                      detailItem.action === "create" ? "default" : detailItem.action === "delete" ? "destructive" : "secondary"
                    }
                  >
                    {detailItem.action}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Statut</div>
                  <Badge
                    variant={
                      detailItem.status === "approved"
                        ? "default"
                        : detailItem.status === "rejected"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {detailItem.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Créée le</div>
                  <div className="text-sm">{new Date(detailItem.created_at).toLocaleString()}</div>
                </div>
                {detailItem.reviewed_at && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Revue le</div>
                    <div className="text-sm">{new Date(detailItem.reviewed_at).toLocaleString()}</div>
                  </div>
                )}
                {detailItem.comment && (
                  <div className="col-span-2">
                    <div className="text-sm font-medium text-muted-foreground">Commentaire</div>
                    <div className="text-sm">{detailItem.comment}</div>
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Données (Payload)</div>
                <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-64">
                  {JSON.stringify(detailItem.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
