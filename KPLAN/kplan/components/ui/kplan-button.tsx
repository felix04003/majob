import { cn } from "@/lib/utils"
import { ButtonHTMLAttributes, forwardRef } from "react"

type KplanVariant = "gold" | "glass" | "ghost-gold" | "danger"

interface KplanButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KplanVariant
  size?: "sm" | "md" | "lg"
  loading?: boolean
}

const variantStyles: Record<KplanVariant, string> = {
  gold:        "text-[#0A0C1A] font-semibold border-0",
  glass:       "text-white/90 border border-white/20 bg-white/10 hover:bg-white/15 backdrop-blur-[24px]",
  "ghost-gold": "text-[#C9A96E] border border-[#C9A96E]/30 bg-transparent hover:bg-[#C9A96E]/10",
  danger:      "text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20",
}

const sizeStyles = { sm: "h-9 px-4 text-sm", md: "h-11 px-6 text-sm", lg: "h-14 px-8 text-base" }

export const KplanButton = forwardRef<HTMLButtonElement, KplanButtonProps>(
  ({ variant = "gold", size = "md", loading, disabled, className, children, style, ...props }, ref) => {
    const isGold = variant === "gold"
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "relative inline-flex items-center justify-center rounded-[100px] font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(201,169,110,0.4)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-[0.97]",
          sizeStyles[size],
          variantStyles[variant],
          !disabled && !loading && "hover:scale-[1.02] hover:-translate-y-px",
          className,
        )}
        style={{
          ...(isGold ? { background: "linear-gradient(135deg, #C9A96E, #E8A0A0)" } : {}),
          minHeight: 44,
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    )
  }
)
KplanButton.displayName = "KplanButton"
