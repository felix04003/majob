"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import HomeButton from "@/components/home-button"

type InviteData = {
  event: { id: string; title: string; start_at: string; venue_name: string | null; venue_address: string | null }
  guest: { id: string; first_name: string; last_name: string; rsvp_status: string }
  invitation: { invite_token: string; status: string; sent_at: string | null }
  qr: { qr_token: string | null; is_active: boolean; revoked_at: string | null }
}

export default function InviteClient({ inviteToken }: { inviteToken: string }) {
  const router = useRouter()
  const [data, setData] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fullName = useMemo(() => {
    if (!data) return ""
    return `${data.guest.first_name} ${data.guest.last_name}`.trim()
  }, [data])

  async function reload() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/invite?token=${encodeURIComponent(inviteToken)}`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setData(null)
      setError((json as any)?.error ?? `Erreur ${res.status}`)
      setLoading(false)
      return
    }
    setData(json as any)
    setLoading(false)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken])

  async function setRsvp(rsvp: "yes" | "no" | "maybe") {
    setSaving(true)
    const res = await fetch("/api/rsvp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteToken, rsvp }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      toast.error((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    toast.success("Réponse enregistrée")
    await reload()
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Invitation</CardTitle>
            <CardDescription>Chargement…</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Invitation</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (!data) return null

  const canShowQr = data.guest.rsvp_status === "yes"

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>{data.event.title}</CardTitle>
              <CardDescription>{new Date(data.event.start_at).toLocaleString()}</CardDescription>
            </div>
            <HomeButton />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm">
            Bonjour <span className="font-medium">{fullName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">RSVP:</span>
            <Badge variant="secondary">{data.guest.rsvp_status}</Badge>
          </div>

          {(data.event.venue_name || data.event.venue_address) && (
            <div className="text-sm text-muted-foreground">
              {data.event.venue_name ? <div>{data.event.venue_name}</div> : null}
              {data.event.venue_address ? <div>{data.event.venue_address}</div> : null}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button onClick={() => setRsvp("yes")} disabled={saving}>
              Oui
            </Button>
            <Button variant="outline" onClick={() => setRsvp("maybe")} disabled={saving}>
              Peut-être
            </Button>
            <Button variant="secondary" onClick={() => setRsvp("no")} disabled={saving}>
              Non
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" disabled={!canShowQr}>
              <Link href={`/p/${inviteToken}`}>Voir mon QR</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/ics?token=${encodeURIComponent(inviteToken)}`}>Ajouter au calendrier</a>
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Retour
            </Button>
          </div>
          {(!data.qr.is_active || !canShowQr) && (
            <div className="text-xs text-muted-foreground">
              {canShowQr
                ? "QR désactivé (non émis ou révoqué). Le planner peut le réactiver."
                : "Le QR est disponible après confirmation RSVP = Oui."}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}


