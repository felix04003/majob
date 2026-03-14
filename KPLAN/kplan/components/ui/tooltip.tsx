"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextType | undefined>(undefined)

function useTooltip() {
  const context = React.useContext(TooltipContext)
  if (!context) {
    throw new Error("useTooltip must be used within Tooltip")
  }
  return context
}

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Tooltip({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (newOpen: boolean) => {
    setInternalOpen(newOpen)
    onOpenChange?.(newOpen)
  }

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div data-slot="tooltip" className="relative inline-block">
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

function TooltipTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  const { open, setOpen } = useTooltip()

  return (
    <button
      data-slot="tooltip-trigger"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className={cn(
        "inline-flex items-center justify-center outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function TooltipContent({
  className,
  children,
  side = "top",
  ...props
}: React.ComponentProps<"div"> & {
  side?: "top" | "bottom" | "left" | "right"
}) {
  const { open } = useTooltip()

  const sideClasses = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  }

  if (!open) return null

  return (
    <div
      data-slot="tooltip-content"
      className={cn(
        "absolute z-50 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
        sideClasses[side],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
