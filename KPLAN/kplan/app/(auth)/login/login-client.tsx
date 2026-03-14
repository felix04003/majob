"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/dashboard"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => email.includes("@") && password.length >= 8, [email, password])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)
    if (error) {
      let errorMessage = error.message
      // Améliorer les messages d'erreur courants
      if (error.message.includes("Invalid login credentials")) {
        errorMessage = "Email ou mot de passe incorrect"
      } else if (error.message.includes("Email not confirmed")) {
        errorMessage = "Veuillez confirmer votre email avant de vous connecter"
      } else if (error.message.includes("Too many requests")) {
        errorMessage = "Trop de tentatives. Veuillez patienter quelques instants"
      }
      setError(errorMessage)
      return
    }

    // Attendre un peu pour que les cookies soient définis
    await new Promise((resolve) => setTimeout(resolve, 100))
    router.replace(next)
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Connexion Planner</CardTitle>
          <CardDescription>Supabase Auth (email + mot de passe)</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              inputMode="email"
            />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              type="password"
              autoComplete="current-password"
            />
            <Button type="submit" disabled={!canSubmit || loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-semibold mb-1">Erreur de connexion</div>
                <div>{error}</div>
              </div>
            )}
            <div className="text-center space-y-2">
              <div>
                <Link href="/forgot-password" className="text-sm text-gray-600 hover:text-gray-900 underline">
                  Mot de passe oublié ?
                </Link>
              </div>
              <div>
                <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 underline">
                  Retour à l'accueil
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}


