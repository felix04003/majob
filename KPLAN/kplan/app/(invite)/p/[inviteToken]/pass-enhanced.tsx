"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import QRCode from "qrcode"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, ArrowLeft, Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { getTemplate } from "@/lib/invitation-templates"

type InviteData = {
  event: { id: string; title: string; start_at: string; venue_name: string | null; type: string; invitation_template: string }
  guest: { id: string; first_name: string; last_name: string; rsvp_status: string }
  qr: { qr_token: string | null; is_active: boolean; revoked_at: string | null }
}

export default function PassEnhanced({ inviteToken }: { inviteToken: string }) {
  const router = useRouter()
  const [data, setData] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const fullName = useMemo(() => {
    if (!data) return ""
    return `${data.guest.first_name} ${data.guest.last_name}`.trim()
  }, [data])

  const template = useMemo(() => {
    return data ? getTemplate(data.event.invitation_template) : null
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
      const url = await QRCode.toDataURL(data.qr.qr_token, {
        margin: 2,
        width: 600,
        color: {
          dark: template?.qrDark || '#be123c',
          light: template?.qrLight || '#fff5f7'
        }
      })
      if (!cancelled) setQrDataUrl(url)
    }
    gen()
    return () => {
      cancelled = true
    }
  }, [data, template])

  async function downloadPass() {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.download = `pass-${fullName.replace(/\s+/g, '-')}.png`
    link.href = qrDataUrl
    link.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-pulse text-2xl text-gray-600">Chargement de votre pass...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <div className="text-red-600 text-lg">{error}</div>
          <Button asChild className="mt-4">
            <Link href={`/i/${inviteToken}`}>Retour à l&apos;invitation</Link>
          </Button>
        </Card>
      </div>
    )
  }

  if (!data || !template) return null

  const canShowQr = data.guest.rsvp_status === "yes" && data.qr.is_active && !!data.qr.qr_token
  const eventDate = new Date(data.event.start_at)

  return (
    <div className={`min-h-screen bg-gradient-to-br ${template.bgGradient} flex items-center justify-center p-4`}>
      <div className="max-w-md w-full space-y-6">

        {/* Pass Card */}
        <div className="relative">
          {/* Decorative elements */}
          <div className={`absolute -top-4 -left-4 w-24 h-24 rounded-full opacity-20 blur-2xl bg-gradient-to-br ${template.accentGradient}`}></div>
          <div className={`absolute -bottom-4 -right-4 w-32 h-32 rounded-full opacity-20 blur-2xl bg-gradient-to-br ${template.sealGradient}`}></div>

          <Card className={`relative overflow-hidden shadow-2xl border-4 ${template.passBorder}`}>
            {/* Header gradient */}
            <div className={`bg-gradient-to-r ${template.passHeaderGradient} p-6 text-white`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                    <span className="text-2xl">🎫</span>
                  </div>
                  <span className="font-semibold text-sm opacity-90">PASS ÉVÉNEMENT</span>
                </div>
                {canShowQr && (
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    <span className="text-xs font-medium">VALIDE</span>
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: template.titleFont }}>{data.event.title}</h2>
              <p className="text-sm opacity-90">{data.event.type}</p>
            </div>

            {/* Body */}
            <div className="p-6 bg-white">
              <div className="space-y-4">
                {/* Guest Info */}
                <div className={`text-center pb-4 border-b-2 border-dashed ${template.passBorder}`}>
                  <div className="text-sm text-gray-500 mb-1">Invité(e)</div>
                  <div className={`text-2xl font-bold bg-gradient-to-r ${template.accentGradient} bg-clip-text text-transparent`}>
                    {fullName}
                  </div>
                </div>

                {/* Event Details */}
                <div className="space-y-2 text-sm">
                  <div className={`flex justify-between items-center p-2 ${template.infoBg} rounded-lg`}>
                    <span className="text-gray-600">Date</span>
                    <span className="font-semibold text-gray-800">
                      {eventDate.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className={`flex justify-between items-center p-2 ${template.infoBg} rounded-lg`}>
                    <span className="text-gray-600">Heure</span>
                    <span className="font-semibold text-gray-800">
                      {eventDate.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {data.event.venue_name && (
                    <div className={`flex justify-between items-center p-2 ${template.infoBg} rounded-lg`}>
                      <span className="text-gray-600">Lieu</span>
                      <span className="font-semibold text-gray-800">{data.event.venue_name}</span>
                    </div>
                  )}
                </div>

                {/* QR Code */}
                {canShowQr && qrDataUrl ? (
                  <div className={`p-6 rounded-2xl border-2 ${template.passBorder} ${template.infoBg}`}>
                    <div className="bg-white p-4 rounded-xl shadow-inner">
                      <img
                        src={qrDataUrl}
                        alt="QR Code"
                        className="w-full h-auto rounded-lg"
                      />
                    </div>
                    <p className="text-center text-xs text-gray-600 mt-3">
                      Présentez ce code QR à l&apos;entrée
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-6 rounded-2xl text-center border-2 border-dashed border-gray-300">
                    <div className="text-4xl mb-2">🔒</div>
                    <p className="text-sm text-gray-600">
                      {data.guest.rsvp_status !== "yes"
                        ? "QR disponible après confirmation RSVP = Oui"
                        : "QR indisponible (non émis ou révoqué)"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className={`${template.infoBg} p-4 text-center`}>
              <p className="text-xs text-gray-600">
                Ce pass est personnel et ne peut être transféré
              </p>
            </div>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {canShowQr && qrDataUrl && (
            <Button
              onClick={downloadPass}
              className={`bg-gradient-to-r ${template.passHeaderGradient} hover:opacity-90 text-white h-12`}
            >
              <Download className="w-5 h-5 mr-2" />
              Télécharger le pass
            </Button>
          )}
          <Button asChild variant="outline" className={`h-12 border-2 ${template.passBorder}`}>
            <Link href={`/i/${inviteToken}`}>
              <ArrowLeft className="w-5 h-5 mr-2" />
              Retour à l&apos;invitation
            </Link>
          </Button>
        </div>

        <p className={`text-center text-sm ${template.secondaryColor}`}>
          Conservez ce pass dans votre téléphone pour un accès rapide
        </p>

        <div className="text-center mt-4">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            Kplan
          </Link>
        </div>
      </div>
    </div>
  )
}
