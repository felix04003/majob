"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import QRCode from "qrcode"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import HomeButton from "@/components/home-button"

type InviteData = {
  event: { id: string; title: string; start_at: string }
  guest: { id: string; first_name: string; last_name: string; rsvp_status: string }
  qr: { qr_token: string | null; is_active: boolean; revoked_at: string | null }
}

export default function PassClient({ inviteToken }: { inviteToken: string }) {
  const router = useRouter()
  const [data, setData] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const fullName = useMemo(() => {
    if (!data) return ""
    return `${data.guest.first_name} ${data.guest.last_name}`.trim()
  }, [data])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/invite?token=${encodeURIComponent(inviteToken)}`, { cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setData(null)
        setError((json as any)?.error ?? `Erreur ${res.status}`)
        setLoading(false)
        return
      }
      setData(json as any)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [inviteToken])

  useEffect(() => {
    let cancelled = false
    async function gen() {
      setQrDataUrl(null)
      if (!data?.qr?.qr_token || !data.qr.is_active) return
      const url = await QRCode.toDataURL(data.qr.qr_token, { margin: 1, width: 512 })
      if (!cancelled) setQrDataUrl(url)
    }
    gen()
    return () => {
      cancelled = true
    }
  }, [data])

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Mon QR</CardTitle>
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
            <CardTitle>Mon QR</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (!data) return null

  const canShowQr = data.guest.rsvp_status === "yes" && data.qr.is_active && !!data.qr.qr_token

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Pass — {data.event.title}</CardTitle>
              <CardDescription>{new Date(data.event.start_at).toLocaleString()}</CardDescription>
            </div>
            <HomeButton />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Invité:</span> <span className="font-medium">{fullName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">RSVP:</span>
            <Badge variant="secondary">{data.guest.rsvp_status}</Badge>
          </div>

          {canShowQr && qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code"
              className="h-auto w-full max-w-sm rounded-md border bg-white p-3"
            />
          ) : (
            <div className="w-full rounded-md border p-4 text-sm text-muted-foreground">
              {data.guest.rsvp_status !== "yes"
                ? "QR disponible après confirmation RSVP = Oui."
                : "QR indisponible (non émis ou révoqué)."}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/i/${inviteToken}`}>← Retour invitation</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Retour
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}


