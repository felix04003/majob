"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function HomeButton({
  label = "Accueil",
  href = "/",
  variant = "outline",
  size = "sm",
}: {
  label?: string
  href?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}) {
  return (
    <Button asChild variant={variant} size={size}>
      <Link href={href}>{label}</Link>
    </Button>
  )
}


