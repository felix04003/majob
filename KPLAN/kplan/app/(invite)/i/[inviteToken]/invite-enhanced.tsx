"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { MapPin, Calendar, Clock, Users, MessageCircle, MapPinned, Utensils, Info } from "lucide-react"
import { getTemplate, type InvitationTemplate, type InvitationCustom } from "@/lib/invitation-templates"

type InviteData = {
  event: {
    id: string
    title: string
    start_at: string
    venue_name: string | null
    venue_address: string | null
    type: string
    invitation_template: string
    invitation_custom: any
    invitation_image_url: string | null
  }
  guest: {
    id: string
    first_name: string
    last_name: string
    rsvp_status: string
    allergies: string | null
    plus_one_count: number
  }
  invitation: { invite_token: string; status: string; sent_at: string | null }
  qr: { qr_token: string | null; is_active: boolean; revoked_at: string | null }
}

export default function InviteEnhanced({ inviteToken }: { inviteToken: string }) {
  const [data, setData] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [envelopeOpen, setEnvelopeOpen] = useState(false)
  const [sealBroken, setSealBroken] = useState(false)
  const [showRsvpForm, setShowRsvpForm] = useState(false)
  const [allergies, setAllergies] = useState("")
  const [personalMessage, setPersonalMessage] = useState("")
  const [saving, setSaving] = useState(false)

  const fullName = useMemo(() => {
    if (!data) return ""
    return `${data.guest.first_name} ${data.guest.last_name}`.trim()
  }, [data])

  // Extraire les prénoms pour l'affichage manuscrit
  const firstNames = useMemo(() => {
    if (!data) return ""
    return data.guest.first_name
  }, [data])

  const timeUntilEvent = useMemo(() => {
    if (!data) return null
    const eventDate = new Date(data.event.start_at)
    const now = new Date()
    const diff = eventDate.getTime() - now.getTime()
    
    if (diff < 0) return { days: 0, hours: 0, minutes: 0, isPast: true }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return { days, hours, minutes, isPast: false }
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
    setAllergies(json.guest?.allergies || "")
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [inviteToken])

  async function submitRsvp(rsvp: "yes" | "no" | "maybe") {
    setSaving(true)
    const res = await fetch("/api/rsvp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        inviteToken, 
        rsvp,
        allergies: allergies.trim() || null,
        personalMessage: personalMessage.trim() || null
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      toast.error((json as any)?.error ?? `Erreur ${res.status}`)
      return
    }
    toast.success(rsvp === "yes" ? "🎉 Merci pour votre confirmation!" : "Réponse enregistrée")
    setShowRsvpForm(false)
    await reload()
  }

  function handleEnvelopeClick() {
    if (!sealBroken) {
      setSealBroken(true)
      setTimeout(() => setEnvelopeOpen(true), 600)
    } else {
      setEnvelopeOpen(true)
    }
  }

  const template = useMemo(() => {
    if (!data) return null
    return getTemplate(data.event.invitation_template)
  }, [data])

  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6`}>
        <div className="text-center">
          <div className="animate-pulse text-2xl text-rose-600">Chargement de votre invitation...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6`}>
        <Card className="p-8 max-w-md text-center">
          <div className="text-red-600 text-lg">{error}</div>
        </Card>
      </div>
    )
  }

  if (!data || !template) return null

  // Enveloppe avec sceau de cire
  if (!envelopeOpen) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${template.bgGradient} flex items-center justify-center p-6 relative`}>
        <div
          className="relative cursor-pointer group"
          onClick={handleEnvelopeClick}
        >
          {/* Enveloppe */}
          <div className={`w-80 h-52 bg-white shadow-2xl rounded-lg border-4 ${template.envelopeColor} ${template.envelopeBorder} transform transition-all duration-500 group-hover:scale-105 group-hover:shadow-3xl relative overflow-hidden`}>
            <div className="flex items-center justify-center h-full flex-col gap-4">
              <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${template.accentGradient} flex items-center justify-center shadow-lg`}>
                <span className="text-3xl text-white">💌</span>
              </div>
              <div className="text-center px-6">
                <div className={`text-lg font-serif ${template.primaryColor}`}>Pour</div>
                <div className={`text-2xl font-bold bg-gradient-to-r ${template.accentGradient} bg-clip-text text-transparent`}>
                  {fullName}
                </div>
                <div className={`text-sm ${template.secondaryColor} mt-2`}>
                  {sealBroken ? "Ouverture..." : "Cliquez pour ouvrir"}
                </div>
              </div>
            </div>

            {/* Sceau de cire */}
            {!sealBroken && (
              <div
                className={`absolute top-4 right-4 w-12 h-12 rounded-full bg-gradient-to-br ${template.sealGradient} shadow-xl flex items-center justify-center transform rotate-12 transition-all duration-300 group-hover:rotate-6 group-hover:scale-110`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleEnvelopeClick()
                }}
              >
                <span className="text-xl">🔖</span>
              </div>
            )}

            {/* Animation de brisure du sceau */}
            {sealBroken && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="animate-ping">
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${template.sealGradient} opacity-20`}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const googleMapsUrl = data.event.venue_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.event.venue_address)}`
    : null

  // Decorative pattern renderer
  const renderDecorativePattern = () => {
    const decorPattern = template.decorPattern || "none"

    if (decorPattern === "dots") {
      return (
        <div className="absolute top-0 left-0 right-0 h-24 opacity-10" style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px"
        }} />
      )
    }

    if (decorPattern === "lines") {
      return (
        <div className="absolute top-0 left-0 right-0 h-24 opacity-10 border-t-2" style={{
          backgroundImage: "repeating-linear-gradient(90deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 20px)"
        }} />
      )
    }

    if (decorPattern === "floral-border") {
      return (
        <div className="absolute top-0 left-0 right-0 h-16 opacity-20 border-t-4 border-dashed" />
      )
    }

    if (decorPattern === "geometric") {
      return (
        <div className="absolute top-4 left-4 w-12 h-12 opacity-10 border-2 border-current" />
      )
    }

    if (decorPattern === "art-deco") {
      return (
        <div className="absolute top-0 left-0 right-0 h-16 opacity-5">
          <div className="h-full border-t-4 border-b-4" />
        </div>
      )
    }

    return null
  }

  // Render program section
  const programItems = data.event.invitation_custom?.program || [
    { time: "14h00", label: "Accueil des invités" },
    { time: "15h00", label: "Cérémonie" },
    { time: "17h00", label: "Vin d'honneur" },
    { time: "19h30", label: "Dîner et soirée" },
  ]

  return (
    <div className={`min-h-screen bg-gradient-to-br ${template.bgGradient} transition-all duration-1000 relative`}>
      {renderDecorativePattern()}

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 relative z-10">
        {/* Header avec animation et typographie personnalisée */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className={`inline-block px-6 py-2 bg-white rounded-full shadow-lg border-2 ${template.cardBorder}`}>
            <span className={`text-sm ${template.secondaryColor} font-medium`}>Vous êtes invité(e) à</span>
          </div>
          <h1 className={`text-5xl md:text-6xl font-serif font-bold bg-gradient-to-r ${template.accentGradient} bg-clip-text text-transparent`} style={{ fontFamily: template.titleFont }}>
            {data.event.title}
          </h1>
          <p className={`text-xl ${template.primaryColor} font-serif`}>
            Cher(ère) <span className="font-handwriting text-3xl italic">{firstNames}</span>,
          </p>
        </div>

        {/* Visuel principal — image personnalisée ou illustration par défaut */}
        {data.event.invitation_image_url ? (
          <div className="relative rounded-3xl overflow-hidden shadow-2xl">
            <img
              src={data.event.invitation_image_url}
              alt={data.event.title}
              className="w-full max-h-[500px] object-cover"
            />
          </div>
        ) : (
          <div className={`relative h-64 md:h-96 rounded-3xl overflow-hidden shadow-2xl transition-all duration-1000`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${template.accentGradient} opacity-70`}></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <Calendar className="w-24 h-24 mx-auto mb-4 opacity-50" />
                <p className="text-2xl font-serif">Illustration de l&apos;événement</p>
              </div>
            </div>
          </div>
        )}

        {/* Compte à rebours avec animation */}
        {timeUntilEvent && !timeUntilEvent.isPast && !data.event.invitation_custom?.hideCountdown && (
          <Card className={`p-6 bg-gradient-to-r ${template.accentGradient} text-white shadow-xl transform transition-all duration-500 hover:scale-105`}>
            <div className="text-center space-y-2">
              <Clock className="w-8 h-8 mx-auto" />
              <h3 className="text-xl font-semibold font-serif">Compte à rebours</h3>
              <div className="flex justify-center gap-4 text-3xl font-bold">
                <div className="flex flex-col transform transition-all duration-300 hover:scale-110">
                  <span>{timeUntilEvent.days}</span>
                  <span className="text-sm font-normal">jours</span>
                </div>
                <span>:</span>
                <div className="flex flex-col transform transition-all duration-300 hover:scale-110">
                  <span>{timeUntilEvent.hours}</span>
                  <span className="text-sm font-normal">heures</span>
                </div>
                <span>:</span>
                <div className="flex flex-col transform transition-all duration-300 hover:scale-110">
                  <span>{timeUntilEvent.minutes}</span>
                  <span className="text-sm font-normal">min</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Informations pratiques avec transition */}
        <Card className={`p-6 space-y-4 shadow-xl border-2 ${template.cardBorder} ${template.cardBg} transform transition-all duration-500 hover:shadow-2xl`}>
          <h3 className={`text-2xl font-serif font-bold ${template.primaryColor} flex items-center gap-2`}>
            <Info className="w-6 h-6" />
            Informations pratiques
          </h3>

          <div className="space-y-3">
            <div className={`flex items-start gap-3 p-3 ${template.infoBg} rounded-lg transform transition-all duration-300 hover:scale-105`}>
              <Calendar className={`w-5 h-5 ${template.secondaryColor} mt-1`} />
              <div>
                <div className="font-semibold text-gray-800">Date</div>
                <div className="text-gray-600">{new Date(data.event.start_at).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</div>
              </div>
            </div>

            {(data.event.venue_name || data.event.venue_address) && (
              <div className={`flex items-start gap-3 p-3 ${template.infoBg} rounded-lg transform transition-all duration-300 hover:scale-105`}>
                <MapPin className={`w-5 h-5 ${template.secondaryColor} mt-1`} />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">Lieu</div>
                  {data.event.venue_name && <div className="text-gray-800">{data.event.venue_name}</div>}
                  {data.event.venue_address && <div className="text-gray-600">{data.event.venue_address}</div>}
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 ${template.secondaryColor} hover:opacity-80 mt-2 text-sm font-medium transition-all`}
                    >
                      <MapPinned className="w-4 h-4" />
                      Ouvrir dans Google Maps
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Programme avec animation */}
        {!data.event.invitation_custom?.hideProgram && (
          <Card className={`p-6 space-y-4 shadow-xl border-2 ${template.cardBorder} ${template.cardBg} transform transition-all duration-500 hover:shadow-2xl`}>
            <h3 className={`text-2xl font-serif font-bold ${template.primaryColor} flex items-center gap-2`}>
              <Users className="w-6 h-6" />
              Programme de la journée
            </h3>
            <div className="space-y-2 text-gray-600">
              {programItems.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex gap-3 items-center transform transition-all duration-300 hover:translate-x-2"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <span className="font-semibold w-20">{item.time}</span>
                  <span>{item.label || item.event}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* RSVP Section avec animation */}
        <Card className={`p-6 space-y-4 shadow-xl border-2 ${template.cardBorder} bg-white transform transition-all duration-500 hover:shadow-2xl`}>
          <h3 className={`text-2xl font-serif font-bold ${template.primaryColor}`}>Confirmez votre présence</h3>

          <div className={`p-4 ${template.infoBg} rounded-lg`}>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <span>Votre réponse actuelle:</span>
              <span className={`px-3 py-1 bg-white rounded-full font-medium ${template.secondaryColor} border ${template.cardBorder}`}>
                {data.guest.rsvp_status === "yes" ? "✓ Oui" : data.guest.rsvp_status === "no" ? "✗ Non" : "? Peut-être"}
              </span>
            </div>
          </div>

          {!showRsvpForm ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                onClick={() => setShowRsvpForm(true)}
                className={`bg-gradient-to-r ${template.accentGradient} hover:opacity-90 text-white h-12 transform transition-all duration-300 hover:scale-105`}
              >
                Modifier ma réponse
              </Button>
              {data.guest.rsvp_status === "yes" && (
                <Button asChild variant="outline" className={`h-12 border-2 ${template.cardBorder} transform transition-all duration-300 hover:scale-105`}>
                  <Link href={`/p/${inviteToken}`}>
                    <span className="mr-2">🎫</span>
                    Voir mon Pass QR
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button
                  onClick={() => submitRsvp("yes")}
                  disabled={saving}
                  className="bg-green-500 hover:bg-green-600 text-white h-12 transform transition-all duration-300 hover:scale-105"
                >
                  ✓ Je serai présent(e)
                </Button>
                <Button
                  onClick={() => submitRsvp("maybe")}
                  disabled={saving}
                  variant="outline"
                  className="h-12 transform transition-all duration-300 hover:scale-105"
                >
                  ? Peut-être
                </Button>
                <Button
                  onClick={() => submitRsvp("no")}
                  disabled={saving}
                  variant="outline"
                  className="h-12 transform transition-all duration-300 hover:scale-105"
                >
                  ✗ Je ne pourrai pas
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                    <Utensils className="w-4 h-4" />
                    Allergies ou régime alimentaire
                  </label>
                  <Input
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="Ex: végétarien, sans gluten, allergies..."
                    className={`border-2 ${template.cardBorder}`}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4" />
                    Message personnel (optionnel)
                  </label>
                  <textarea
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value)}
                    placeholder="Un petit mot pour les organisateurs..."
                    rows={3}
                    className={`w-full rounded-md border-2 ${template.cardBorder} px-3 py-2 text-sm resize-none`}
                  />
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setShowRsvpForm(false)}
                className="w-full transform transition-all duration-300 hover:scale-105"
              >
                Annuler
              </Button>
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className={`text-center ${template.secondaryColor} text-sm py-8`}>
          <p>Cette invitation est personnelle et ne peut être transférée</p>
          <p className="mt-2">Pour toute question, contactez les organisateurs</p>
        </div>

        <div className="text-center mt-4">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            Kplan
          </Link>
        </div>
      </div>
    </div>
  )
}
