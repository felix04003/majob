"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type EventOption = { id: string; title: string; start_at: string }

export default function DayOfPage() {
  const [events, setEvents] = useState<EventOption[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [qrToken, setQrToken] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [counts, setCounts] = useState({ valid: 0, already_checked_in: 0, invalid: 0, revoked: 0 })
  const [history, setHistory] = useState<Array<{ at: string; token: string; result: string }>>([])
  const [flash, setFlash] = useState<null | { className: string; label: string }>(null)
  const [flashEnabled, setFlashEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stopRef = useRef<null | (() => void)>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const flashTimerRef = useRef<number | null>(null)

  function resultMeta(r: string) {
    if (r === "valid") return { label: "Valide", className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40" }
    if (r === "already_checked_in")
      return { label: "Déjà scanné", className: "bg-amber-500/15 text-amber-200 border-amber-500/40" }
    if (r === "revoked") return { label: "Révoqué", className: "bg-red-500/15 text-red-200 border-red-500/40" }
    if (r === "invalid") return { label: "Invalide", className: "bg-red-500/15 text-red-200 border-red-500/40" }
    return { label: r, className: "bg-muted text-muted-foreground" }
  }

  function flashMeta(r: string) {
    if (r === "valid") return { label: "VALIDE", className: "bg-emerald-500" }
    if (r === "already_checked_in") return { label: "DÉJÀ SCANNÉ", className: "bg-amber-500" }
    if (r === "revoked") return { label: "RÉVOQUÉ", className: "bg-red-500" }
    if (r === "invalid") return { label: "INVALIDE", className: "bg-red-500" }
    return { label: String(r).toUpperCase(), className: "bg-muted" }
  }

  function beepForResult(r: string) {
    if (!soundEnabled) return
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (!ctx) return
      if (ctx.state === "suspended") void ctx.resume()

      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"

      const freq =
        r === "valid" ? 880 :
        r === "already_checked_in" ? 660 :
        r === "revoked" ? 330 :
        r === "invalid" ? 220 : 440

      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.2)
    } catch {
      // ignore audio errors
    }
  }

  function triggerFlash(r: string) {
    if (!flashEnabled) return
    const m = flashMeta(r)
    setFlash({ className: m.className, label: m.label })
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 500)
  }

  function pushHistory(token: string, r: string) {
    const trimmed = token.trim()
    const short = trimmed.length > 18 ? `${trimmed.slice(0, 10)}…${trimmed.slice(-6)}` : trimmed
    setHistory((h) => [{ at: new Date().toISOString(), token: short, result: r }, ...h].slice(0, 12))
  }

  function bumpCount(r: string) {
    if (r !== "valid" && r !== "already_checked_in" && r !== "invalid" && r !== "revoked") return
    setCounts((c) => ({ ...c, [r]: (c as any)[r] + 1 }))
  }

  async function submit() {
    const token = qrToken.trim()
    if (!token) return
    setIsChecking(true)
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qrToken: token }),
    })
    const data = await res.json().catch(() => ({}))
    const r = data?.result ?? "unknown"
    setResult(r)
    bumpCount(r)
    pushHistory(token, r)
    triggerFlash(r)
    beepForResult(r)
    setIsChecking(false)
  }

  async function startScan() {
    setCameraError(null)
    setResult(null)
    setScanning(true)

    try {
      // Stop any previous scan session first.
      stopRef.current?.()
      stopRef.current = null

      const reader = new BrowserMultiFormatReader()
      const video = videoRef.current
      if (!video) throw new Error("Video element not ready")

      const controls = await reader.decodeFromVideoDevice(undefined, video, async (res, err) => {
        if (res) {
          const text = res.getText()
          setQrToken(text)
          // Stop the camera quickly after a successful scan
          controls.stop()
          stopRef.current = null
          setScanning(false)
          await submitWithToken(text)
        } else if (err) {
          const name = (err as any)?.name
          // NotFoundException is emitted constantly when no code is in view; ignore it.
          if (name !== "NotFoundException") {
            setCameraError((err as any)?.message ?? "Erreur scan")
          }
        }
      })
      stopRef.current = () => controls.stop()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur caméra"
      let errorMsg = msg
      
      // Détecter les erreurs de permission
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("not allowed")) {
        errorMsg = "Permission refusée. Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur."
      } else if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no device")) {
        errorMsg = "Aucune caméra détectée. Vérifiez que votre appareil dispose d'une caméra et qu'elle n'est pas utilisée par une autre application."
      }
      
      setCameraError(errorMsg)
      setScanning(false)
    }
  }

  async function stopScan() {
    setScanning(false)
    stopRef.current?.()
    stopRef.current = null
  }

  async function submitWithToken(token: string) {
    const t = token.trim()
    if (!t) return
    setIsChecking(true)
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qrToken: t }),
    })
    const data = await res.json().catch(() => ({}))
    const r = data?.result ?? "unknown"
    setResult(r)
    bumpCount(r)
    pushHistory(t, r)
    triggerFlash(r)
    beepForResult(r)
    setIsChecking(false)
  }

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/planner/events", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(json.events)) {
          setEvents(json.events.map((e: any) => ({ id: e.id, title: e.title, start_at: e.start_at })))
        }
      } catch { /* ignore */ }
    }
    loadEvents()
    return () => {
      stopRef.current?.()
      stopRef.current = null
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
  }, [])

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      {flash ? (
        <div className={`fixed inset-0 z-50 ${flash.className} transition-opacity duration-75`}>
          <div className="flex h-full w-full items-center justify-center">
            <div className="rounded-xl bg-black/60 px-6 py-4 text-2xl font-semibold text-white">
              {flash.label}
            </div>
          </div>
        </div>
      ) : null}

      {/* Sélecteur d'événement */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Événement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedEventId ?? ""}
              onChange={(e) => setSelectedEventId(e.target.value || null)}
            >
              <option value="">— Tous les événements —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({new Date(ev.start_at).toLocaleDateString("fr-FR")})
                </option>
              ))}
            </select>
            {selectedEventId && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/dayof/${selectedEventId}`}>
                  Ouvrir le dashboard Jour-J
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Jour J — Scan</CardTitle>
          <CardDescription>Scannez un QR code ou saisissez le token manuellement.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="text-xs text-muted-foreground">
            Astuce: colle ici un <code>qrToken</code> (table <code>qr_passes.qr_token</code>) ou scanne le QR depuis{" "}
            <code>/p/&lt;inviteToken&gt;</code> (si RSVP = Oui).
          </div>
          <div className="flex gap-2">
            {!scanning ? (
              <Button onClick={startScan} type="button">
                Démarrer la caméra
              </Button>
            ) : (
              <Button onClick={stopScan} type="button" variant="secondary">
                Arrêter
              </Button>
            )}
            <Button
              type="button"
              variant={soundEnabled ? "secondary" : "outline"}
              onClick={() => setSoundEnabled((v) => !v)}
            >
              Son
            </Button>
            <Button
              type="button"
              variant={flashEnabled ? "secondary" : "outline"}
              onClick={() => setFlashEnabled((v) => !v)}
            >
              Flash
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Valides</div>
              <div className="text-lg font-semibold">{counts.valid}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Déjà scannés</div>
              <div className="text-lg font-semibold">{counts.already_checked_in}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Invalides</div>
              <div className="text-lg font-semibold">{counts.invalid}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Révoqués</div>
              <div className="text-lg font-semibold">{counts.revoked}</div>
            </div>
          </div>

          <video ref={videoRef} className="aspect-video w-full rounded-md bg-black" muted playsInline />
          {cameraError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold mb-1">Erreur caméra</div>
              <div className="mb-2">{cameraError}</div>
              {cameraError.includes("Permission") && (
                <div className="text-xs text-red-700 space-y-1">
                  <div><strong>Chrome/Edge :</strong> Cliquez sur l'icône 🔒 dans la barre d'adresse → Autoriser la caméra</div>
                  <div><strong>Firefox :</strong> Cliquez sur l'icône 🔒 → Autorisations → Caméra → Autoriser</div>
                  <div><strong>Safari :</strong> Préférences → Sites web → Caméra → Autoriser</div>
                  <div className="mt-2 text-red-600">Ou utilisez la saisie manuelle ci-dessous en attendant.</div>
                </div>
              )}
            </div>
          )}

          <Input value={qrToken} onChange={(e) => setQrToken(e.target.value)} placeholder="qrToken" />
          <Button onClick={submit} disabled={!qrToken.trim() || isChecking} type="button">
            {isChecking ? "Vérification…" : "Vérifier"}
          </Button>
          {result && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Résultat:</span>
              <Badge className={resultMeta(result).className}>{resultMeta(result).label}</Badge>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-sm font-medium">Historique</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setCounts({ valid: 0, already_checked_in: 0, invalid: 0, revoked: 0 })
                setHistory([])
              }}
            >
              Réinitialiser
            </Button>
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucun scan.</div>
          ) : (
            <div className="divide-y rounded-md border">
              {history.map((h, idx) => (
                <div key={`${h.at}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <div className="font-mono text-xs text-muted-foreground">{h.token}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString()}</div>
                  </div>
                  <Badge className={resultMeta(h.result).className}>{resultMeta(h.result).label}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


