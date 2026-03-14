'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Circle, CheckCircle2, Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useRealtimeTable } from '@/hooks/use-realtime'

type DayOfTask = {
  id: string
  title: string
  description: string | null
  scheduled_time: string | null
  assigned_to: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: string
  is_dayof: boolean
}

type ProgressData = {
  total: number
  completed: number
  percentage: number
}

const COLOR_PALETTE = [
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
  'bg-green-100 text-green-800',
  'bg-yellow-100 text-yellow-800',
  'bg-red-100 text-red-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-800',
]

const hashStringToColor = (str: string): string => {
  if (!str) return COLOR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}

const getCurrentTimeInMinutes = (): number => {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

const timeStringToMinutes = (timeStr: string | null): number | null => {
  if (!timeStr) return null
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

const formatTime = (timeStr: string | null): string => {
  if (!timeStr) return '—'
  return timeStr
}

const statusCycleMap = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
} as const

interface DayofChecklistProps {
  eventId: string
}

export default function DayofChecklist({ eventId }: DayofChecklistProps) {
  const [tasks, setTasks] = useState<DayOfTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPerson, setFilterPerson] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [progress, setProgress] = useState<ProgressData>({ total: 0, completed: 0, percentage: 0 })
  const [newTask, setNewTask] = useState({
    title: '',
    scheduled_time: '',
    assigned_to: '',
    description: '',
    priority: 'medium',
  })

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/planner/events/${eventId}/tasks?dayof=true`)
      if (!response.ok) throw new Error('Failed to fetch tasks')
      const data = await response.json()
      setTasks(data.tasks || [])
      setProgress(data.progress || { total: 0, completed: 0, percentage: 0 })
    } catch (error) {
      console.error('Error fetching tasks:', error)
      toast.error('Erreur lors du chargement des tâches')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  // Initial load
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Realtime: auto-refresh when tasks table changes
  useRealtimeTable({
    table: 'tasks',
    event: '*',
    onchange: () => {
      setTimeout(fetchTasks, 300)
    },
  })

  const handleStatusToggle = async (taskId: string, currentStatus: string) => {
    const newStatus = statusCycleMap[currentStatus as keyof typeof statusCycleMap]
    try {
      const response = await fetch(
        `/api/planner/events/${eventId}/tasks/${taskId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }
      )
      if (!response.ok) throw new Error('Failed to update task')
      toast.success('Tâche mise à jour')
      fetchTasks()
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Erreur lors de la mise à jour')
    }
  }

  const handleAddTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Le titre est requis')
      return
    }

    try {
      const response = await fetch(
        `/api/planner/events/${eventId}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newTask.title,
            scheduled_time: newTask.scheduled_time || null,
            assigned_to: newTask.assigned_to || null,
            description: newTask.description || null,
            priority: newTask.priority,
            is_dayof: true,
            status: 'todo',
          }),
        }
      )
      if (!response.ok) throw new Error('Failed to create task')
      toast.success('Tâche ajoutée')
      setAddDialogOpen(false)
      setNewTask({
        title: '',
        scheduled_time: '',
        assigned_to: '',
        description: '',
        priority: 'medium',
      })
      fetchTasks()
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Erreur lors de la création de la tâche')
    }
  }

  const uniquePersons = Array.from(new Set(tasks.map(t => t.assigned_to).filter((v): v is string => !!v))).sort()
  const filteredTasks = filterPerson
    ? tasks.filter(t => t.assigned_to === filterPerson)
    : tasks

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const timeA = timeStringToMinutes(a.scheduled_time) ?? Infinity
    const timeB = timeStringToMinutes(b.scheduled_time) ?? Infinity
    return timeA - timeB
  })

  const currentTimeInMinutes = getCurrentTimeInMinutes()

  const isLate = (task: DayOfTask): boolean => {
    if (task.status === 'done') return false
    const taskTime = timeStringToMinutes(task.scheduled_time)
    return taskTime !== null && taskTime < currentTimeInMinutes
  }

  const isUrgent = (task: DayOfTask): boolean => {
    return task.priority === 'urgent'
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Checklist Jour-J</h1>
          <Button onClick={() => setAddDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Ajouter
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {progress.completed} / {progress.total}
            </span>
            <span className="text-gray-600">{Math.round(progress.percentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-green-500 h-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Person Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={filterPerson === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterPerson(null)}
          className="whitespace-nowrap"
        >
          Tous
        </Button>
        {uniquePersons.map(person => (
          <Button
            key={person}
            variant={filterPerson === person ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterPerson(person)}
            className="whitespace-nowrap"
          >
            {person}
          </Button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              Chargement...
            </CardContent>
          </Card>
        ) : sortedTasks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              Aucune tâche Jour-J. Commencez par ajouter les étapes de votre journée.
            </CardContent>
          </Card>
        ) : (
          sortedTasks.map(task => (
            <Card
              key={task.id}
              className={`transition-all ${
                task.status === 'done'
                  ? 'bg-gray-50 opacity-60'
                  : isLate(task)
                  ? 'border-l-4 border-l-red-500'
                  : task.status === 'in_progress'
                  ? 'border-l-4 border-l-amber-500'
                  : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Status Circle */}
                  <button
                    onClick={() => handleStatusToggle(task.id, task.status)}
                    className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-full"
                  >
                    {task.status === 'done' ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : task.status === 'in_progress' ? (
                      <div className="w-6 h-6 rounded-full border-2 border-amber-500 relative">
                        <div className="absolute inset-0 bg-amber-500 w-1/2 rounded-full" />
                      </div>
                    ) : (
                      <Circle className="w-6 h-6 text-gray-400 border" />
                    )}
                  </button>

                  {/* Time Column */}
                  <div className="w-14 flex-shrink-0">
                    <span className="text-sm font-medium text-gray-700">
                      {formatTime(task.scheduled_time)}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="flex-grow">
                    <p
                      className={`${
                        task.status === 'done'
                          ? 'line-through text-gray-500'
                          : isUrgent(task)
                          ? 'font-bold'
                          : 'font-medium'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                    )}
                  </div>

                  {/* Assigned Badge */}
                  <div className="flex-shrink-0">
                    {task.assigned_to ? (
                      <Badge className={`${hashStringToColor(task.assigned_to)}`}>
                        {task.assigned_to}
                      </Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
                  </div>

                  {/* Late Badge */}
                  {isLate(task) && (
                    <Badge className="flex-shrink-0 bg-red-100 text-red-800">
                      En retard
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Task Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une tâche Jour-J</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Titre */}
            <div>
              <label className="block text-sm font-medium mb-1">Titre *</label>
              <Input
                placeholder="Titre de la tâche"
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              />
            </div>

            {/* Heure */}
            <div>
              <label className="block text-sm font-medium mb-1">Heure</label>
              <Input
                type="time"
                value={newTask.scheduled_time}
                onChange={e => setNewTask({ ...newTask, scheduled_time: e.target.value })}
              />
            </div>

            {/* Assigné à */}
            <div>
              <label className="block text-sm font-medium mb-1">Assigné à</label>
              <Input
                list="assignees"
                placeholder="Nom de la personne"
                value={newTask.assigned_to}
                onChange={e => setNewTask({ ...newTask, assigned_to: e.target.value })}
              />
              <datalist id="assignees">
                {uniquePersons.map(person => (
                  <option key={person} value={person} />
                ))}
              </datalist>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Détails supplémentaires (optionnel)"
                rows={3}
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
              />
            </div>

            {/* Priorité */}
            <div>
              <label className="block text-sm font-medium mb-1">Priorité</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newTask.priority}
                onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
              >
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button onClick={handleAddTask}>
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
