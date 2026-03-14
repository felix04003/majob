"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function Select({ ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm appearance-none cursor-pointer [background-image:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg>')] [background-repeat:no-repeat] [background-position:right_8px_center] [background-size:1em] pr-8",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        props.className
      )}
      {...props}
    />
  )
}

function SelectGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="select-group"
      className={cn("", className)}
      {...props}
    />
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="select-label"
      disabled
      className={cn("", className)}
      {...props}
    />
  )
}

function SelectItem({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="select-item"
      className={cn("", className)}
      {...props}
    />
  )
}

export { Select, SelectGroup, SelectLabel, SelectItem }
