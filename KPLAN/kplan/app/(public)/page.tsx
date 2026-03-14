"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { CalendarDays, Users, QrCode, LayoutGrid, Bell, ClipboardCheck, ArrowRight, CheckCircle2 } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { KplanButton } from "@/components/ui/kplan-button"
import { PhotoGallery } from "@/components/ui/gallery"

const features = [
  { icon: CalendarDays, title: "Gestion d'événements", description: "Créez et gérez vos événements de A à Z. Timeline, budget, prestataires — tout au même endroit." },
  { icon: Users,        title: "Portail client collaboratif", description: "Vos clients proposent des invités et modifications, validées par vous sous 4h via un SLA intégré." },
  { icon: LayoutGrid,   title: "Plan de table interactif", description: "Placez vos invités par glisser-déposer sur mobile ou desktop. Visualisez en 3D avant le jour J." },
  { icon: QrCode,       title: "Check-in Jour J", description: "Scannez les QR codes des invités à l'entrée. Dashboard temps réel des arrivées." },
  { icon: Bell,         title: "Notifications temps réel", description: "Soyez alerté instantanément des nouvelles demandes et rappels grâce à Supabase Realtime." },
  { icon: ClipboardCheck, title: "Checklist Jour J", description: "Liste de tâches chronologique avec assignation par équipier. Suivi en direct." },
]

const steps = [
  { step: "01", title: "Créez votre événement", description: "Définissez la date, le lieu, le budget et les détails en quelques clics." },
  { step: "02", title: "Invitez et collaborez",  description: "Partagez un lien client pour que vos clients proposent invités et modifications." },
  { step: "03", title: "Gérez le Jour J",        description: "Scannez les QR codes, suivez les arrivées et cochez vos tâches depuis votre mobile." },
]

const stats = [
  { value: 500,  suffix: "+", label: "événements gérés" },
  { value: 4,    suffix: "h", label: "SLA garanti" },
  { value: 98,   suffix: "%", label: "satisfaction client" },
]

function AnimatedStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      let start = 0
      const step = value / 40
      const timer = setInterval(() => {
        start += step
        if (start >= value) { setCount(value); clearInterval(timer) }
        else setCount(Math.floor(start))
      }, 30)
    }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl font-bold md:text-5xl" style={{ background: "linear-gradient(135deg, #ffffff, #C9A96E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        {count}{suffix}
      </div>
      <div className="mt-1 text-sm text-white/50">{label}</div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ─── Navbar ─── */}
      <header className="sticky top-0 z-50 border-b border-white/8 backdrop-blur-[40px]" style={{ background: "rgba(10,12,26,0.7)" }}>
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            Kplan
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <KplanButton variant="ghost-gold" size="sm">Connexion</KplanButton>
            </Link>
            <Link href="/login">
              <KplanButton variant="gold" size="sm">
                Commencer <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </KplanButton>
            </Link>
          </div>
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center md:py-36">
        <div className="mb-4 inline-flex items-center rounded-full border border-kplan-gold/30 bg-kplan-gold/10 px-4 py-1.5 text-xs font-medium text-kplan-gold">
          ✦ Gestion d'événements premium
        </div>
        <h1
          className="mb-6 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent md:text-7xl"
          style={{ backgroundImage: "linear-gradient(160deg, #ffffff 0%, #C9A96E 50%, #E8A0A0 100%)", letterSpacing: "-2px" }}
        >
          Organisez sans{" "}
          <span style={{ fontFamily: "var(--font-dancing)", fontStyle: "italic", color: "#C9A96E", WebkitTextFillColor: "#C9A96E" }}>
            stress
          </span>
        </h1>
        <p className="mb-10 max-w-2xl text-lg leading-relaxed text-white/65">
          La plateforme tout-en-un pour les wedding planners et organisateurs d'événements professionnels.
          Clients, invités, plan de table, Jour J — tout centralisé.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/login">
            <KplanButton variant="gold" size="lg">
              Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
            </KplanButton>
          </Link>
          <Link href="/login">
            <KplanButton variant="glass" size="lg">Voir la démo</KplanButton>
          </Link>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="mx-auto w-full max-w-3xl px-6 py-12">
        <GlassCard variant="strong" className="grid grid-cols-3 gap-8 py-8">
          {stats.map((s) => <AnimatedStat key={s.label} {...s} />)}
        </GlassCard>
      </section>

      {/* ─── Features ─── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-white/95 md:text-4xl">Tout ce dont vous avez besoin</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <GlassCard key={f.title} hover className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kplan-gold/15">
                <f.icon className="h-5 w-5 text-kplan-gold" />
              </div>
              <h3 className="font-semibold text-white/95">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{f.description}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ─── PhotoGallery ─── */}
      <section className="mx-auto max-w-6xl px-6 py-8">
        <PhotoGallery animationDelay={0.3} />
      </section>

      {/* ─── Comment ça marche ─── */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-white/95 md:text-4xl">Comment ça marche</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <GlassCard key={s.step} className="text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-[#0A0C1A]" style={{ background: "linear-gradient(135deg, #C9A96E, #E8A0A0)" }}>
                {s.step}
              </div>
              <h3 className="mb-2 font-semibold text-white/95">{s.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{s.description}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ─── Pourquoi Kplan ─── */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="mb-10 text-center text-3xl font-bold text-white/95 md:text-4xl">Pourquoi choisir Kplan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "SLA 4h garanti sur les demandes client",
            "Plan de table 3D avec drag-and-drop",
            "QR code unique par invité",
            "Dashboard temps réel le jour J",
            "Notifications instantanées (Realtime)",
            "100% responsive, conçu pour mobile",
            "Collaboration planner-client fluide",
            "Hébergé sur Supabase, rapide et sécurisé",
          ].map((item) => (
            <GlassCard key={item} padding="sm" className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-kplan-sage" />
              <span className="text-sm font-medium text-white/80">{item}</span>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white/95 md:text-4xl">Prêt à simplifier vos événements ?</h2>
          <p className="mb-8 text-lg text-white/55">
            Rejoignez les organisateurs qui gèrent leurs événements avec sérénité grâce à Kplan.
          </p>
          <Link href="/login">
            <KplanButton variant="gold" size="lg">
              Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
            </KplanButton>
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/8 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="text-sm text-white/30">&copy; {new Date().getFullYear()} Kplan. Tous droits réservés.</div>
          <Link href="/login" className="text-sm text-white/30 transition-colors hover:text-white/60">Connexion</Link>
        </div>
      </footer>
    </div>
  )
}
