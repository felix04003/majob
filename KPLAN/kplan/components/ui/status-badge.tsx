import { cn } from "@/lib/utils"

type EventStatus = "active" | "jour-j" | "completed" | "pending" | "cancelled"

const config: Record<EventStatus, { label: string; classes: string; pulse?: boolean }> = {
  active:    { label: "En cours",   classes: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  "jour-j":  { label: "Jour J",     classes: "bg-[#C9A96E]/15 text-[#C9A96E] border-[#C9A96E]/30", pulse: true },
  completed: { label: "Terminé",    classes: "bg-green-500/15 text-green-300 border-green-500/30" },
  pending:   { label: "En attente", classes: "bg-white/8 text-white/50 border-white/15" },
  cancelled: { label: "Annulé",     classes: "bg-red-500/15 text-red-300 border-red-500/30" },
}

export function StatusBadge({ status, className }: { status: EventStatus; className?: string }) {
  const { label, classes, pulse } = config[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", classes, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-gold-pulse")} />
      {label}
    </span>
  )
}
