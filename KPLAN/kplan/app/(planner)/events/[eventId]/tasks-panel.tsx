"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"

/* ---------- types ---------- */

interface Task {
  id: string
  event_id: string
  milestone_id: string | null
  title: string
  description: string | null
  due_at: string | null
  priority: string
  status: string
  category: string | null
  requires_client_validation: boolean
  comments_count: number
  validation: { status: string; client_comment: string | null } | null
  created_at: string
  updated_at: string
}

interface Milestone {
  id: string
  event_id: string
  name: string
  description: string | null
  target_date: string | null
  position: number
}

interface TaskComment {
  id: string
  task_id: string
  author_type: string
  author_name: string | null
  content: string
  created_at: string
}

interface Progress {
  total: number
  completed: number
  percentage: number
  overdue_count: number
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
}

const STATUS_LABELS: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Fait",
}

/* ---------- component ---------- */

export default function TasksPanel({ eventId }: { eventId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [progress, setProgress] = useState<Progress>({
    total: 0,
    completed: 0,
    percentage: 0,
    overdue_count: 0,
  })
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [search, setSearch] = useState("")

  // Dialogs
  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState("")

  // Milestone dialog
  const [showMilestoneCreate, setShowMilestoneCreate] = useState(false)
  const [milestoneForm, setMilestoneForm] = useState({ name: "", description: "", target_date: "" })

  // Task form
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_at: "",
    priority: "medium",
    status: "todo",
    category: "",
    requires_client_validation: false,
    milestone_id: "",
  })
  const [saving, setSaving] = useState(false)

  /* ---------- loaders ---------- */

  const loadTasks = async () => {
    setLoading(true)
    try {
      const [tasksRes, milestonesRes] = await Promise.all([
        fetch(`/api/planner/events/${eventId}/tasks`, { cache: "no-store" }),
        fetch(`/api/planner/events/${eventId}/milestones`, {
          cache: "no-store",
        }),
      ])
      const td = await tasksRes.json()
      const md = await milestonesRes.json()
      setTasks(td.tasks ?? [])
      setProgress(
        td.progress ?? { total: 0, completed: 0, percentage: 0, overdue_count: 0 },
      )
      setMilestones(md.milestones ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [eventId])

  const loadComments = async (taskId: string) => {
    try {
      const res = await fetch(
        `/api/planner/events/${eventId}/tasks/${taskId}/comments`,
        { cache: "no-store" },
      )
      const d = await res.json()
      setComments(d.comments ?? [])
    } catch (e) {
      console.error(e)
    }
  }

  /* ---------- filtered tasks ---------- */

  const filtered = useMemo(() => {
    let result = tasks
    if (statusFilter !== "all")
      result = result.filter((t) => t.status === statusFilter)
    if (priorityFilter !== "all")
      result = result.filter((t) => t.priority === priorityFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      )
    }
    return result
  }, [tasks, statusFilter, priorityFilter, search])

  /* ---------- handlers ---------- */

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      due_at: "",
      priority: "medium",
      status: "todo",
      category: "",
      requires_client_validation: false,
      milestone_id: "",
    })
  }

  const openCreate = () => {
    resetForm()
    setEditTask(null)
    setShowCreate(true)
  }

  const openEdit = (t: Task) => {
    setForm({
      title: t.title,
      description: t.description ?? "",
      due_at: t.due_at ? t.due_at.slice(0, 10) : "",
      priority: t.priority,
      status: t.status,
      category: t.category ?? "",
      requires_client_validation: t.requires_client_validation,
      milestone_id: t.milestone_id ?? "",
    })
    setEditTask(t)
    setShowCreate(true)
  }

  const openDetail = async (t: Task) => {
    setDetailTask(t)
    await loadComments(t.id)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Le titre est requis")
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        priority: form.priority,
        status: form.status,
        category: form.category.trim() || null,
        requires_client_validation: form.requires_client_validation,
        milestone_id: form.milestone_id || null,
      }

      if (editTask) {
        const res = await fetch(
          `/api/planner/events/${eventId}/tasks/${editTask.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success("Tâche modifiée")
      } else {
        const res = await fetch(`/api/planner/events/${eventId}/tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success("Tâche créée")
      }
      setShowCreate(false)
      loadTasks()
    } catch (e: any) {
      toast.error(e.message ?? "Erreur")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: Task) => {
    if (!confirm("Supprimer cette tâche ?")) return
    try {
      const res = await fetch(
        `/api/planner/events/${eventId}/tasks/${t.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Tâche supprimée")
      setDetailTask(null)
      loadTasks()
    } catch (e: any) {
      toast.error(e.message ?? "Erreur")
    }
  }

  const handleStatusChange = async (t: Task, newStatus: string) => {
    try {
      const res = await fetch(
        `/api/planner/events/${eventId}/tasks/${t.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      )
      if (!res.ok) throw new Error((await res.json()).error)
      loadTasks()
    } catch (e: any) {
      toast.error(e.message ?? "Erreur")
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || !detailTask) return
    try {
      const res = await fetch(
        `/api/planner/events/${eventId}/tasks/${detailTask.id}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: newComment.trim() }),
        },
      )
      if (!res.ok) throw new Error((await res.json()).error)
      setNewComment("")
      loadComments(detailTask.id)
      loadTasks()
    } catch (e: any) {
      toast.error(e.message ?? "Erreur")
    }
  }

  const handleCreateMilestone = async () => {
    if (!milestoneForm.name.trim()) {
      toast.error("Le nom du jalon est requis")
      return
    }
    try {
      const res = await fetch(
        `/api/planner/events/${eventId}/milestones`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: milestoneForm.name.trim(),
            description: milestoneForm.description.trim() || null,
            target_date: milestoneForm.target_date
              ? new Date(milestoneForm.target_date).toISOString()
              : null,
            position: milestones.length,
          }),
        },
      )
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Jalon créé")
      setShowMilestoneCreate(false)
      setMilestoneForm({ name: "", description: "", target_date: "" })
      loadTasks()
    } catch (e: any) {
      toast.error(e.message ?? "Erreur")
    }
  }

  /* ---------- helpers ---------- */

  const isOverdue = (t: Task) =>
    t.due_at && new Date(t.due_at) < new Date() && t.status !== "done"

  const milestoneName = (id: string | null) =>
    milestones.find((m) => m.id === id)?.name ?? "—"

  /* ---------- render ---------- */

  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Progression : {progress.completed}/{progress.total} tâches •{" "}
            {progress.percentage}%
          </span>
          {progress.overdue_count > 0 && (
            <Badge variant="destructive">
              {progress.overdue_count} en retard
            </Badge>
          )}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={openCreate}>
          + Nouvelle tâche
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowMilestoneCreate(true)}
        >
          + Jalon
        </Button>
        <div className="flex-1" />
        <Input
          placeholder="Rechercher…"
          className="max-w-[200px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground">Statut :</span>
        {["all", "todo", "in_progress", "done"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "secondary" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "Tous" : STATUS_LABELS[s]}
          </Button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">Priorité :</span>
        {["all", "urgent", "high", "medium", "low"].map((p) => (
          <Button
            key={p}
            size="sm"
            variant={priorityFilter === p ? "secondary" : "outline"}
            onClick={() => setPriorityFilter(p)}
          >
            {p === "all" ? "Toutes" : PRIORITY_LABELS[p]}
          </Button>
        ))}
      </div>

      {/* Tasks table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune tâche trouvée.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tâche</TableHead>
                <TableHead className="hidden md:table-cell">Jalon</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden md:table-cell">Échéance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => openDetail(t)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.title}</span>
                      {t.requires_client_validation && (
                        <Badge
                          variant={
                            t.validation?.status === "validated"
                              ? "default"
                              : t.validation?.status === "refused"
                                ? "destructive"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {t.validation?.status === "validated"
                            ? "✓ Validé"
                            : t.validation?.status === "refused"
                              ? "✗ Refusé"
                              : "⏳ À valider"}
                        </Badge>
                      )}
                      {t.comments_count > 0 && (
                        <span className="text-xs text-muted-foreground">
                          💬 {t.comments_count}
                        </span>
                      )}
                    </div>
                    {t.category && (
                      <span className="text-xs text-muted-foreground">
                        {t.category}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs">
                      {t.milestone_id ? milestoneName(t.milestone_id) : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        (PRIORITY_COLORS[t.priority] as any) ?? "outline"
                      }
                    >
                      {PRIORITY_LABELS[t.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <select
                      className="rounded border bg-background px-2 py-1 text-xs"
                      value={t.status}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleStatusChange(t, e.target.value)
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.due_at ? (
                      <span
                        className={isOverdue(t) ? "font-medium text-red-500" : ""}
                      >
                        {new Date(t.due_at).toLocaleDateString("fr-FR")}
                        {isOverdue(t) && " ⚠️"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(t)
                      }}
                    >
                      ✏️
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ========== TASK DETAIL DIALOG ========== */}
      <Dialog open={!!detailTask} onOpenChange={() => setDetailTask(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailTask?.title}</DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    (PRIORITY_COLORS[detailTask.priority] as any) ?? "outline"
                  }
                >
                  {PRIORITY_LABELS[detailTask.priority]}
                </Badge>
                <Badge variant="outline">
                  {STATUS_LABELS[detailTask.status]}
                </Badge>
                {detailTask.category && (
                  <Badge variant="outline">{detailTask.category}</Badge>
                )}
                {isOverdue(detailTask) && (
                  <Badge variant="destructive">En retard</Badge>
                )}
              </div>
              {detailTask.description && <p>{detailTask.description}</p>}
              {detailTask.due_at && (
                <p>
                  <span className="font-medium">Échéance :</span>{" "}
                  {new Date(detailTask.due_at).toLocaleDateString("fr-FR")}
                </p>
              )}
              {detailTask.milestone_id && (
                <p>
                  <span className="font-medium">Jalon :</span>{" "}
                  {milestoneName(detailTask.milestone_id)}
                </p>
              )}
              {detailTask.requires_client_validation && detailTask.validation && (
                <div className="rounded-lg border p-3">
                  <p className="font-medium">
                    Validation client :{" "}
                    {detailTask.validation.status === "validated"
                      ? "✓ Validé"
                      : detailTask.validation.status === "refused"
                        ? "✗ Refusé"
                        : "⏳ En attente"}
                  </p>
                  {detailTask.validation.client_comment && (
                    <p className="mt-1 text-muted-foreground">
                      {detailTask.validation.client_comment}
                    </p>
                  )}
                </div>
              )}

              {/* Comments section */}
              <div className="border-t pt-3">
                <p className="mb-2 font-medium">
                  Commentaires ({comments.length})
                </p>
                <div className="flex max-h-[200px] flex-col gap-2 overflow-y-auto">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg p-2 text-sm ${c.author_type === "planner" ? "bg-primary/10" : "bg-muted"}`}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">
                          {c.author_type === "planner"
                            ? "Planner"
                            : "Client"}
                        </span>
                        •
                        <span>
                          {new Date(c.created_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="mt-1">{c.content}</p>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Aucun commentaire.
                    </p>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Ajouter un commentaire…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddComment()
                    }}
                  />
                  <Button size="sm" onClick={handleAddComment}>
                    Envoyer
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetailTask(null)
                    openEdit(detailTask)
                  }}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(detailTask)}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== CREATE / EDIT TASK DIALOG ========== */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTask ? "Modifier la tâche" : "Nouvelle tâche"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Titre</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Confirmer le traiteur"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Échéance
                </label>
                <Input
                  type="date"
                  value={form.due_at}
                  onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Priorité
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value })
                  }
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Catégorie
                </label>
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  placeholder="Ex: Traiteur, Déco…"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Jalon</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.milestone_id}
                  onChange={(e) =>
                    setForm({ ...form, milestone_id: e.target.value })
                  }
                >
                  <option value="">Aucun jalon</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requires_validation"
                checked={form.requires_client_validation}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requires_client_validation: e.target.checked,
                  })
                }
              />
              <label htmlFor="requires_validation" className="text-sm">
                Nécessite la validation du client
              </label>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Enregistrement…"
                : editTask
                  ? "Enregistrer"
                  : "Créer la tâche"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== CREATE MILESTONE DIALOG ========== */}
      <Dialog open={showMilestoneCreate} onOpenChange={setShowMilestoneCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau jalon</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nom</label>
              <Input
                value={milestoneForm.name}
                onChange={(e) =>
                  setMilestoneForm({ ...milestoneForm, name: e.target.value })
                }
                placeholder="Ex: Phase 1 — Préparation"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={2}
                value={milestoneForm.description}
                onChange={(e) =>
                  setMilestoneForm({
                    ...milestoneForm,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Date cible
              </label>
              <Input
                type="date"
                value={milestoneForm.target_date}
                onChange={(e) =>
                  setMilestoneForm({
                    ...milestoneForm,
                    target_date: e.target.value,
                  })
                }
              />
            </div>
            <Button onClick={handleCreateMilestone}>Créer le jalon</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
