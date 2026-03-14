"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

type Guest = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  category: string | null
  rsvp_status: string
  plus_one_count: number
  allergies: string | null
  notes: string | null
}

type Change = {
  id: string
  action: "create" | "update" | "delete"
  status: string
  payload: Record<string, unknown>
  created_at: string
  guest_id: string | null
  reviewed_at?: string | null
  comment?: string | null
}

type GuestForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
  category: string
  plus_one_count: number
  allergies: string
  notes: string
}

const EMPTY_FORM: GuestForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  category: "",
  plus_one_count: 0,
  allergies: "",
  notes: "",
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Aucune catégorie" },
  { value: "famille_mariee", label: "Famille de la mariée" },
  { value: "famille_marie", label: "Famille du marié" },
  { value: "amis_mariee", label: "Amis de la mariée" },
  { value: "amis_marie", label: "Amis du marié" },
  { value: "collegues", label: "Collègues" },
  { value: "other", label: "Autre" },
]

/* ---------- CSV parser (no external deps) ---------- */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  // Parse header
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())

  // Map common header names to our fields
  const fieldMap: Record<string, string> = {
    prenom: "first_name",
    prénom: "first_name",
    first_name: "first_name",
    firstname: "first_name",
    nom: "last_name",
    last_name: "last_name",
    lastname: "last_name",
    email: "email",
    mail: "email",
    "e-mail": "email",
    telephone: "phone",
    téléphone: "phone",
    tel: "phone",
    phone: "phone",
    portable: "phone",
    categorie: "category",
    catégorie: "category",
    category: "category",
    groupe: "category",
    accompagnants: "plus_one_count",
    plus_one: "plus_one_count",
    plus_one_count: "plus_one_count",
    allergies: "allergies",
    allergie: "allergies",
    notes: "notes",
    remarques: "notes",
    commentaire: "notes",
  }

  const mappedHeaders = headers.map((h) => fieldMap[h] ?? h)

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    mappedHeaders.forEach((key, idx) => {
      if (values[idx]?.trim()) row[key] = values[idx].trim()
    })
    // Skip rows without first_name or last_name
    if (row.first_name && row.last_name) rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === "," || ch === ";") {
        result.push(current)
        current = ""
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}

/* ---------- component ---------- */

export default function ClientGuestsClient({ clientToken }: { clientToken: string }) {
  const token = clientToken
  const [guests, setGuests] = useState<Guest[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Form
  const [form, setForm] = useState<GuestForm>({ ...EMPTY_FORM })
  const [showForm, setShowForm] = useState(false)

  // File import
  const fileRef = useRef<HTMLInputElement>(null)
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)

  const canCreate = useMemo(
    () => form.first_name.trim().length > 1 && form.last_name.trim().length > 1,
    [form.first_name, form.last_name],
  )

  /* ---------- loaders ---------- */

  async function reloadChanges() {
    const c = await fetch(
      `/api/client/changes?token=${encodeURIComponent(token)}`,
    ).then((r) => r.json().catch(() => ({})))
    setChanges(
      Array.isArray((c as any)?.changes) ? (c as any).changes : [],
    )
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const [g, c] = await Promise.all([
        fetch(
          `/api/client/guests?token=${encodeURIComponent(token)}`,
        ).then(async (r) => ({
          ok: r.ok,
          status: r.status,
          body: await r.json().catch(() => ({})),
        })),
        fetch(
          `/api/client/changes?token=${encodeURIComponent(token)}`,
        ).then(async (r) => ({
          ok: r.ok,
          status: r.status,
          body: await r.json().catch(() => ({})),
        })),
      ])
      if (cancelled) return
      if (!g.ok || !c.ok) {
        const gErr = !g.ok
          ? `guests: ${g.status} ${(g.body as any)?.error ?? ""}`.trim()
          : null
        const cErr = !c.ok
          ? `changes: ${c.status} ${(c.body as any)?.error ?? ""}`.trim()
          : null
        setLoadError([gErr, cErr].filter(Boolean).join(" | "))
        setGuests([])
        setChanges([])
        setLoading(false)
        return
      }

      setGuests(
        Array.isArray((g.body as any)?.guests) ? (g.body as any).guests : [],
      )
      setChanges(
        Array.isArray((c.body as any)?.changes) ? (c.body as any).changes : [],
      )
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  /* ---------- single guest submit ---------- */

  async function requestCreate() {
    setActionError(null)
    const payload: Record<string, unknown> = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
    }
    if (form.email.trim()) payload.email = form.email.trim()
    if (form.phone.trim()) payload.phone = form.phone.trim()
    if (form.category) payload.category = form.category
    if (form.plus_one_count > 0) payload.plus_one_count = form.plus_one_count
    if (form.allergies.trim()) payload.allergies = form.allergies.trim()
    if (form.notes.trim()) payload.notes = form.notes.trim()

    const res = await fetch("/api/client/guest-change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientToken: token,
        action: "create",
        payload,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setActionError((data as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    toast.success("Demande d'ajout envoyée")
    setForm({ ...EMPTY_FORM })
    setShowForm(false)
    await reloadChanges()
  }

  /* ---------- file import ---------- */

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext !== "csv") {
      toast.error(
        "Format non supporté. Veuillez exporter votre fichier Excel en .csv (UTF-8) puis réimporter.",
      )
      if (fileRef.current) fileRef.current.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const rows = parseCSV(text)
        if (rows.length === 0) {
          toast.error(
            "Aucun invité trouvé dans le fichier. Vérifiez que les colonnes Prénom et Nom sont présentes.",
          )
          return
        }
        setImportPreview(rows)
        setShowImport(true)
      } catch {
        toast.error("Erreur lors de la lecture du fichier")
      }
    }
    reader.readAsText(file, "UTF-8")
    if (fileRef.current) fileRef.current.value = ""
  }

  async function submitImport() {
    setImporting(true)
    let successCount = 0
    let errorCount = 0

    for (const row of importPreview) {
      const payload: Record<string, unknown> = {
        first_name: row.first_name,
        last_name: row.last_name,
      }
      if (row.email) payload.email = row.email
      if (row.phone) payload.phone = row.phone
      if (row.category) payload.category = row.category
      if (row.plus_one_count)
        payload.plus_one_count = parseInt(row.plus_one_count) || 0
      if (row.allergies) payload.allergies = row.allergies
      if (row.notes) payload.notes = row.notes

      try {
        const res = await fetch("/api/client/guest-change", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientToken: token,
            action: "create",
            payload,
          }),
        })
        if (res.ok) successCount++
        else errorCount++
      } catch {
        errorCount++
      }
    }

    setImporting(false)
    setShowImport(false)
    setImportPreview([])

    if (errorCount > 0) {
      toast.error(`${successCount} demandes envoyées, ${errorCount} erreurs`)
    } else {
      toast.success(`${successCount} demandes d'ajout envoyées`)
    }
    await reloadChanges()
  }

  /* ---------- render ---------- */

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Invités</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setShowForm(true)}>
              + Ajouter un invité
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              Importer un fichier (CSV)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {actionError && (
            <div className="text-sm text-red-600">{actionError}</div>
          )}
          {loadError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              <div className="font-medium">Erreur de chargement</div>
              <div className="text-red-200/90">
                {loadError}
                <div className="mt-1 text-xs">
                  Vérifie que tu utilises le bon lien{" "}
                  <code>/c/&lt;clientToken&gt;/guests</code> (pas{" "}
                  <code>demo-token</code>).
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="official">
        <TabsList>
          <TabsTrigger value="official">
            Officiel ({guests.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            En attente ({changes.filter((c) => c.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="history">
            Historique ({changes.length})
          </TabsTrigger>
        </TabsList>

        {/* ===== Official guests ===== */}
        <TabsContent value="official">
          <Card>
            <CardHeader>
              <CardTitle>Liste officielle</CardTitle>
              <CardDescription>
                Invités approuvés par le planner
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  Chargement…
                </div>
              ) : guests.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun invité pour le moment.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Téléphone</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>RSVP</TableHead>
                        <TableHead>+1</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {guests.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium">
                            {g.first_name} {g.last_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {g.email || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {g.phone || "—"}
                          </TableCell>
                          <TableCell>
                            {g.category ? (
                              <Badge variant="outline">{g.category}</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                g.rsvp_status === "confirmed"
                                  ? "default"
                                  : g.rsvp_status === "declined"
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {g.rsvp_status === "confirmed"
                                ? "Confirmé"
                                : g.rsvp_status === "declined"
                                  ? "Décliné"
                                  : "En attente"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {g.plus_one_count > 0 ? g.plus_one_count : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Pending changes ===== */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Demandes en attente</CardTitle>
              <CardDescription>
                En attente de validation par le planner
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  Chargement…
                </div>
              ) : (
                <ChangesList
                  changes={changes.filter((c) => c.status === "pending")}
                  emptyMessage="Aucune demande en attente."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== All history ===== */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Historique complet</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  Chargement…
                </div>
              ) : (
                <ChangesList
                  changes={changes}
                  emptyMessage="Aucune demande soumise."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== ADD GUEST DIALOG ===== */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un invité</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Prénom *
                </label>
                <Input
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                  placeholder="Marie"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Nom *
                </label>
                <Input
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                  placeholder="Dupont"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="marie@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Téléphone
                </label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Catégorie
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Accompagnants (+1)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={form.plus_one_count}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      plus_one_count: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Allergies / Régime
              </label>
              <Input
                value={form.allergies}
                onChange={(e) =>
                  setForm({ ...form, allergies: e.target.value })
                }
                placeholder="Végétarien, sans gluten…"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Informations complémentaires…"
              />
            </div>
            <Button onClick={requestCreate} disabled={!canCreate}>
              Envoyer la demande d'ajout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== IMPORT PREVIEW DIALOG ===== */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Importer {importPreview.length} invité(s)
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Vérifiez les données ci-dessous avant d'envoyer les demandes
              d'ajout. Chaque invité sera soumis à la validation du planner.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Catégorie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>{row.first_name}</TableCell>
                      <TableCell>{row.last_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.email || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.phone || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.category || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2">
              <Button onClick={submitImport} disabled={importing}>
                {importing
                  ? "Envoi en cours…"
                  : `Envoyer ${importPreview.length} demande(s)`}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowImport(false)
                  setImportPreview([])
                }}
              >
                Annuler
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium">Format attendu (CSV) :</p>
              <p className="mt-1">
                Colonnes reconnues : Prénom, Nom, Email, Téléphone, Catégorie,
                Accompagnants, Allergies, Notes
              </p>
              <p className="mt-1">
                Séparateur : virgule (,) ou point-virgule (;). Encodage : UTF-8.
              </p>
              <p className="mt-1">
                Pour Excel : Fichier → Enregistrer sous → CSV UTF-8 (.csv)
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

/* ---------- Changes list sub-component ---------- */

function ChangesList({
  changes,
  emptyMessage,
}: {
  changes: Change[]
  emptyMessage: string
}) {
  if (changes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">{emptyMessage}</div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invité</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Commentaire planner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.map((c) => {
            const p = c.payload ?? {}
            const name =
              `${(p.first_name as string) ?? ""} ${(p.last_name as string) ?? ""}`.trim() ||
              "—"
            const contact =
              (p.email as string) || (p.phone as string) || "—"

            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {contact}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      c.status === "approved"
                        ? "default"
                        : c.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {c.status === "approved"
                      ? "Approuvé"
                      : c.status === "rejected"
                        ? "Rejeté"
                        : "En attente"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.comment?.toString() || "—"}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
