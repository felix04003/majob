"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type SeedResult = {
  event: { id: string; title: string; start_at: string }
  clientAccess: { client_token: string }
  links: { clientGuestsPath: string; dayofPath: string }
  qrPasses: Array<{ guest_id: string; qr_token: string }>
}

export default function SeedPanel() {
  const [title, setTitle] = useState("Démo Kplan")
  const [guestsCount, setGuestsCount] = useState(8)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [result, setResult] = useState<SeedResult | null>(null)

  const canSubmit = useMemo(() => title.trim().length >= 2 && guestsCount >= 0 && guestsCount <= 50, [title, guestsCount])

  async function runSeed() {
    setError(null)
    setHint(null)
    setLoading(true)
    setResult(null)
    const res = await fetch("/api/planner/seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), guestsCount }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(data?.error ?? "Erreur seed")
      setHint(typeof data?.hint === "string" ? data.hint : null)
      return
    }
    setResult(data)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup rapide (démo)</CardTitle>
        <CardDescription>
          Crée un event + un <code>clientToken</code> + des invités + QR (utile pour tester /requests et /dayof).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre event" />
          <Input
            value={String(guestsCount)}
            onChange={(e) => setGuestsCount(Number(e.target.value))}
            inputMode="numeric"
            placeholder="Nombre invités"
          />
          <Button onClick={runSeed} disabled={!canSubmit || loading}>
            {loading ? "Création…" : "Créer une démo"}
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-600">
            {error}
            {hint ? <div className="mt-1 text-xs text-red-600/90">{hint}</div> : null}
          </div>
        )}

        {result && (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">Créé</div>
            <div className="text-muted-foreground">
              Event: <code>{result.event.title}</code> — <code>{result.event.id}</code>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={result.links.clientGuestsPath}>Ouvrir côté client</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={result.links.dayofPath}>Ouvrir Jour J</Link>
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              clientToken: <code>{result.clientAccess.client_token}</code>
            </div>
            {result.qrPasses?.[0] ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Exemple qrToken (pour tester scan): <code>{result.qrPasses[0].qr_token}</code>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


