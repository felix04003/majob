"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Tâches", path: "tasks" },
  { label: "Invités", path: "guests" },
  { label: "Rendez-vous", path: "appointments" },
]

export default function ClientEventLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const eventId = params.eventId as string

  async function handleLogout() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.push("/client/login")
  }

  return (
    <div className="min-h-dvh">
      <nav className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1">
            <Link href="/client" className="text-sm text-muted-foreground hover:text-foreground mr-4">
              ← Mes événements
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.path}
                href={`/client/${eventId}/${item.path}`}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  pathname.endsWith(`/${item.path}`)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Déconnexion
          </Button>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
