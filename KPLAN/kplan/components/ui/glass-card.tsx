import { cn } from "@/lib/utils"

type GlassVariant = "default" | "strong" | "subtle" | "gold" | "danger"
type GlassPadding = "sm" | "md" | "lg"

interface GlassCardProps {
  variant?: GlassVariant
  hover?: boolean
  padding?: GlassPadding
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

const variantStyles: Record<GlassVariant, string> = {
  default: "bg-white/10 border-white/[0.18]",
  strong:  "bg-white/[0.18] border-white/25",
  subtle:  "bg-white/5  border-white/10",
  gold:    "bg-[#C9A96E]/10 border-[#C9A96E]/30",
  danger:  "bg-red-500/5 border-red-500/20",
}

const paddingStyles: Record<GlassPadding, string> = {
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
}

export function GlassCard({
  variant = "default",
  hover = false,
  padding = "md",
  className,
  children,
  style,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur-[24px]",
        variantStyles[variant],
        paddingStyles[padding],
        hover && "transition-transform duration-200 hover:-translate-y-1 hover:scale-[1.01] cursor-pointer",
        className,
      )}
      style={{
        boxShadow: "var(--glass-shadow)",
        ...style,
      }}
    >
      {/* Inner top highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
      />
      {children}
    </div>
  )
}
