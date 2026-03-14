"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { GlassCard } from "@/components/ui/glass-card"
import { KplanButton } from "@/components/ui/kplan-button"

type Tab = "planner" | "client"

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/dashboard"

  const [activeTab, setActiveTab] = useState<Tab>("planner")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  const canSubmit = useMemo(() => email.includes("@") && password.length >= 8, [email, password])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    setLoading(false)
    if (error) {
      const msg = error.message.includes("Invalid login credentials")
        ? "Email ou mot de passe incorrect"
        : error.message.includes("Too many requests")
        ? "Trop de tentatives. Veuillez patienter"
        : error.message
      setError(msg)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    await new Promise((r) => setTimeout(r, 100))
    router.replace(next)
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 text-center">
          <span
            className="text-5xl font-bold"
            style={{ fontFamily: "var(--font-dancing)", background: "linear-gradient(135deg, #C9A96E, #E8A0A0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            K
          </span>
          <p className="mt-2 text-sm uppercase tracking-widest text-white/40">Kplan</p>
        </div>

        {/* Glass tab switcher */}
        <div
          className="mb-4 flex rounded-full p-1"
          style={{ backdropFilter: "blur(12px) saturate(160%)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
          role="tablist"
          aria-label="Type de connexion"
        >
          {(["planner", "client"] as Tab[]).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                onClick={() => { setActiveTab(tab); setError(null) }}
                className="flex-1 rounded-full py-2 text-sm font-medium transition-all duration-200"
                style={{
                  minHeight: 44,
                  background: isActive ? "linear-gradient(135deg, #C9A96E, #E8A0A0)" : "transparent",
                  color: isActive ? "#0A0C1A" : "rgba(255,255,255,0.50)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab === "planner" ? "Connexion Planner" : "Accès Client"}
              </button>
            )
          })}
        </div>

        {activeTab === "planner" ? (
          <GlassCard className={shake ? "shake" : ""}>
            <h1 className="mb-6 text-xl font-semibold text-white/95">Connexion Planner</h1>

            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/40">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  required
                  className="border-white/12 bg-white/8 text-white placeholder:text-white/30 focus-visible:ring-[rgba(201,169,110,0.35)]"
                  style={{ borderColor: error ? "rgba(239,68,68,0.5)" : undefined }}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/40">
                  Mot de passe
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="border-white/12 bg-white/8 text-white placeholder:text-white/30 focus-visible:ring-[rgba(201,169,110,0.35)]"
                  style={{ borderColor: error ? "rgba(239,68,68,0.5)" : undefined }}
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <KplanButton type="submit" disabled={!canSubmit} loading={loading} className="mt-2 w-full">
                Se connecter
              </KplanButton>
            </form>

            <div className="mt-5 text-center">
              <Link href="/forgot-password" className="text-sm text-white/40 transition-colors hover:text-kplan-gold">
                Mot de passe oublié ?
              </Link>
            </div>
          </GlassCard>
        ) : (
          <GlassCard>
            <h1 className="mb-4 text-xl font-semibold text-white/95">Accès Client</h1>
            <p className="mb-6 text-sm text-white/50">
              Votre planner vous a envoyé un lien d&apos;invitation par email. Connectez-vous via ce lien ou accédez à votre espace ci-dessous.
            </p>
            <Link href="/client/login">
              <KplanButton variant="glass" className="w-full">
                Accéder à mon espace client →
              </KplanButton>
            </Link>
          </GlassCard>
        )}
      </div>
    </main>
  )
}
