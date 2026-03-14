"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CalendarDays, LogOut } from "lucide-react"

type EventAccess = {
  event_id: string
  events: {
    id: string
    title: string
    start_at: string | null
  }
}

export default function ClientDashboard() {
  const router = useRouter()
  const [events, setEvents] = useState<EventAccess[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = supabaseBrowser()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/client/login"); return }

      const { data } = await supabase
        .from("client_access")
        .select("event_id, events(id, title, start_at)")
        .eq("user_id", user.id)
        .eq("is_revoked", false)
        .order("invited_at", { ascending: false })

      setEvents((data as unknown as EventAccess[]) ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function handleLogout() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.push("/client/login")
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-dvh">Chargement…</div>
  }

  return (
    <div className="min-h-dvh p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mes événements</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground text-center mt-12">
          Aucun événement disponible pour le moment.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((acc) => (
            <Link key={acc.event_id} href={`/client/${acc.event_id}/tasks`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{acc.events?.title ?? "Événement"}</CardTitle>
                  {acc.events?.start_at && (
                    <CardDescription className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(acc.events.start_at).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "long", year: "numeric"
                      })}
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
