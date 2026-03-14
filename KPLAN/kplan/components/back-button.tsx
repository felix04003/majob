"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function BackButton({
  fallbackHref = "/",
  label = "Retour",
  variant = "outline",
  size = "sm",
}: {
  fallbackHref?: string
  label?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}) {
  const router = useRouter()

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back()
        else router.push(fallbackHref)
      }}
    >
      {label}
    </Button>
  )
}


