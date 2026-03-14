"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"

type Task = {
  id: string
  title: string
  description: string
  status: "todo" | "in_progress" | "done"
  priority: "low" | "medium" | "high" | "urgent"
  due_date: string | null
  category: string | null
  milestone_id: string | null
  milestone_title: string | null
  requires_client_validation: boolean
  validation?: {
    status: "pending" | "approved" | "refused"
    comment: string | null
  }
}

type Comment = {
  id: string
  content: string
  author_name: string
  created_at: string
}

type EventData = {
  event: {
    id: string
    title: string
  }
  tasks: Task[]
}

const statusLabels: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Fait",
}

const priorityVariants: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
}

const priorityLabels: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
}

const appointmentTypeLabels: Record<string, string> = {
  rdv_client: "RDV Client",
  prestataire: "Prestataire",
  visite_lieu: "Visite lieu",
  degustation: "Dégustation",
  other: "Autre",
}

export default function ClientTasksView({ clientToken }: { clientToken: string }) {
  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)
  const [validating, setValidating] = useState(false)
  const [refusalComment, setRefusalComment] = useState("")

  async function reload() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/client/tasks?token=${encodeURIComponent(clientToken)}`, {
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

  async function loadComments(taskId: string) {
    setCommentsLoading(true)
    const res = await fetch(
      `/api/client/tasks/${encodeURIComponent(taskId)}/comments?token=${encodeURIComponent(clientToken)}`,
      { cache: "no-store" }
    )
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setComments((json as any)?.comments ?? [])
    }
    setCommentsLoading(false)
  }

  async function addComment() {
    if (!selectedTask || !newComment.trim()) return
    setSubmittingComment(true)
    const res = await fetch(
      `/api/client/tasks/${encodeURIComponent(selectedTask.id)}/comments?token=${encodeURIComponent(clientToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      }
    )
    setSubmittingComment(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    toast.success("Commentaire ajouté")
    setNewComment("")
    await loadComments(selectedTask.id)
  }

  async function validateTask(approved: boolean) {
    if (!selectedTask) return
    if (!approved && !refusalComment.trim()) {
      toast.error("Veuillez fournir un commentaire pour refuser")
      return
    }
    setValidating(true)
    const res = await fetch(
      `/api/client/tasks/${encodeURIComponent(selectedTask.id)}/validate?token=${encodeURIComponent(clientToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approved,
          comment: approved ? null : refusalComment,
        }),
      }
    )
    setValidating(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    toast.success(approved ? "Tâche validée" : "Tâche refusée")
    setRefusalComment("")
    setSelectedTask(null)
    await reload()
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToken])

  useEffect(() => {
    if (selectedTask) {
      loadComments(selectedTask.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask])

  if (loading) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Tâches</CardTitle>
            <CardDescription>Chargement…</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Tâches</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (!data) return null

  const allTasks = data.tasks || []
  const completedTasks = allTasks.filter((t) => t.status === "done").length
  const progressPercentage = allTasks.length > 0 ? (completedTasks / allTasks.length) * 100 : 0

  // Separate pending validation tasks
  const pendingValidationTasks = allTasks.filter(
    (t) => t.requires_client_validation && t.validation?.status === "pending"
  )

  // Group tasks by milestone
  const milestoneGroups = new Map<string, Task[]>()
  const withoutMilestone: Task[] = []

  allTasks.forEach((task) => {
    if (task.milestone_id) {
      if (!milestoneGroups.has(task.milestone_id)) {
        milestoneGroups.set(task.milestone_id, [])
      }
      milestoneGroups.get(task.milestone_id)!.push(task)
    } else {
      withoutMilestone.push(task)
    }
  })

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>{data.event.title}</CardTitle>
          <CardDescription>Tâches et validations</CardDescription>
        </CardHeader>
      </Card>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progression</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Progress value={completedTasks} max={allTasks.length} />
          <p className="text-sm text-muted-foreground">
            {completedTasks} sur {allTasks.length} tâches complétées
          </p>
        </CardContent>
      </Card>

      {/* Pending Validation Section */}
      {pendingValidationTasks.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <CardHeader>
            <CardTitle className="text-base text-orange-900 dark:text-orange-100">
              Actions requises
            </CardTitle>
            <CardDescription className="text-orange-800 dark:text-orange-200">
              {pendingValidationTasks.length} tâche(s) en attente de validation
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendingValidationTasks.map((task) => (
              <Dialog key={task.id}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => setSelectedTask(task)}
                    className="flex flex-col gap-2 rounded-lg border border-orange-300 bg-white p-3 text-left transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/30 dark:hover:bg-orange-900/50"
                  >
                    <div className="font-medium">{task.title}</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={priorityVariants[task.priority]}>
                        {priorityLabels[task.priority]}
                      </Badge>
                      {task.due_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.due_date).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <TaskDetailDialog
                    task={task}
                    comments={comments}
                    commentsLoading={commentsLoading}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    onAddComment={addComment}
                    submittingComment={submittingComment}
                    refusalComment={refusalComment}
                    setRefusalComment={setRefusalComment}
                    onValidate={() => validateTask(true)}
                    onRefuse={() => validateTask(false)}
                    validating={validating}
                  />
                </DialogContent>
              </Dialog>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tasks by Milestone */}
      {Array.from(milestoneGroups.entries()).map(([milestoneId, tasks]) => {
        const milestone = allTasks.find((t) => t.milestone_id === milestoneId)
        return (
          <div key={milestoneId} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-muted-foreground">
              {milestone?.milestone_title}
            </h2>
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <Dialog key={task.id}>
                  <DialogTrigger asChild>
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="font-medium">{task.title}</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {statusLabels[task.status]}
                          </Badge>
                          <Badge variant={priorityVariants[task.priority]}>
                            {priorityLabels[task.priority]}
                          </Badge>
                          {task.category && (
                            <span className="text-xs text-muted-foreground">{task.category}</span>
                          )}
                          {task.requires_client_validation && (
                            <Badge
                              variant={
                                task.validation?.status === "pending"
                                  ? "destructive"
                                  : task.validation?.status === "approved"
                                    ? "default"
                                    : "outline"
                              }
                            >
                              {task.validation?.status === "pending"
                                ? "À valider"
                                : task.validation?.status === "approved"
                                  ? "Validée"
                                  : "Refusée"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {task.due_date && (
                        <div className="flex-shrink-0 text-right text-sm text-muted-foreground">
                          {new Date(task.due_date).toLocaleDateString("fr-FR")}
                        </div>
                      )}
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <TaskDetailDialog
                      task={task}
                      comments={comments}
                      commentsLoading={commentsLoading}
                      newComment={newComment}
                      setNewComment={setNewComment}
                      onAddComment={addComment}
                      submittingComment={submittingComment}
                      refusalComment={refusalComment}
                      setRefusalComment={setRefusalComment}
                      onValidate={() => validateTask(true)}
                      onRefuse={() => validateTask(false)}
                      validating={validating}
                    />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </div>
        )
      })}

      {/* Tasks without Milestone */}
      {withoutMilestone.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Sans jalon</h2>
          <div className="flex flex-col gap-2">
            {withoutMilestone.map((task) => (
              <Dialog key={task.id}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => setSelectedTask(task)}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="font-medium">{task.title}</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {statusLabels[task.status]}
                        </Badge>
                        <Badge variant={priorityVariants[task.priority]}>
                          {priorityLabels[task.priority]}
                        </Badge>
                        {task.category && (
                          <span className="text-xs text-muted-foreground">{task.category}</span>
                        )}
                        {task.requires_client_validation && (
                          <Badge
                            variant={
                              task.validation?.status === "pending"
                                ? "destructive"
                                : task.validation?.status === "approved"
                                  ? "default"
                                  : "outline"
                            }
                          >
                            {task.validation?.status === "pending"
                              ? "À valider"
                              : task.validation?.status === "approved"
                                ? "Validée"
                                : "Refusée"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {task.due_date && (
                      <div className="flex-shrink-0 text-right text-sm text-muted-foreground">
                        {new Date(task.due_date).toLocaleDateString("fr-FR")}
                      </div>
                    )}
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <TaskDetailDialog
                    task={task}
                    comments={comments}
                    commentsLoading={commentsLoading}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    onAddComment={addComment}
                    submittingComment={submittingComment}
                    refusalComment={refusalComment}
                    setRefusalComment={setRefusalComment}
                    onValidate={() => validateTask(true)}
                    onRefuse={() => validateTask(false)}
                    validating={validating}
                  />
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

function TaskDetailDialog({
  task,
  comments,
  commentsLoading,
  newComment,
  setNewComment,
  onAddComment,
  submittingComment,
  refusalComment,
  setRefusalComment,
  onValidate,
  onRefuse,
  validating,
}: {
  task: Task
  comments: Comment[]
  commentsLoading: boolean
  newComment: string
  setNewComment: (value: string) => void
  onAddComment: () => Promise<void>
  submittingComment: boolean
  refusalComment: string
  setRefusalComment: (value: string) => void
  onValidate: () => Promise<void>
  onRefuse: () => Promise<void>
  validating: boolean
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{task.title}</DialogTitle>
        <DialogDescription>{task.milestone_title || "Sans jalon"}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 max-h-[calc(100dvh-200px)] overflow-y-auto">
        {/* Task Details */}
        <div className="flex flex-col gap-2 border-b pb-4">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Statut</span>
            <Badge variant="outline" className="mt-1">
              {statusLabels[task.status]}
            </Badge>
          </div>
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Priorité</span>
            <Badge variant={priorityVariants[task.priority]} className="mt-1">
              {priorityLabels[task.priority]}
            </Badge>
          </div>
          {task.due_date && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground">Échéance</span>
              <div className="mt-1 text-sm">
                {new Date(task.due_date).toLocaleDateString("fr-FR")}
              </div>
            </div>
          )}
          {task.category && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground">Catégorie</span>
              <div className="mt-1 text-sm">{task.category}</div>
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="flex flex-col gap-2 border-b pb-4">
            <span className="text-xs font-semibold text-muted-foreground">Description</span>
            <p className="text-sm whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Comments */}
        <div className="flex flex-col gap-2 border-b pb-4">
          <span className="text-xs font-semibold text-muted-foreground">Commentaires</span>
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
            {commentsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun commentaire</p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg bg-muted p-2 text-sm border border-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-xs">{comment.author_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleDateString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>
                </div>
              ))
            )}
          </div>
          <Textarea
            placeholder="Ajouter un commentaire…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="text-sm"
          />
          <Button
            onClick={onAddComment}
            disabled={submittingComment || !newComment.trim()}
            size="sm"
          >
            Envoyer
          </Button>
        </div>

        {/* Validation Widget */}
        {task.requires_client_validation && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <span className="text-xs font-semibold text-muted-foreground">Validation</span>
            {task.validation?.status === "pending" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Veuillez valider ou refuser cette tâche</p>
                {/* Refusal requires a comment */}
                <Textarea
                  placeholder="Commentaire (obligatoire en cas de refus)…"
                  value={refusalComment}
                  onChange={(e) => setRefusalComment(e.target.value)}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button onClick={onValidate} disabled={validating} className="flex-1">
                    Valider
                  </Button>
                  <Button
                    onClick={onRefuse}
                    disabled={validating || !refusalComment.trim()}
                    variant="secondary"
                    className="flex-1"
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    task.validation?.status === "approved" ? "default" : "destructive"
                  }
                >
                  {task.validation?.status === "approved" ? "Validée" : "Refusée"}
                </Badge>
                {task.validation?.comment && (
                  <p className="text-sm text-muted-foreground italic">
                    {task.validation.comment}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
