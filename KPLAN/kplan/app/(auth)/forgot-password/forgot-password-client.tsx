"use client"

import { useState } from "react"
import Link from "next/link"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canSubmit = email.includes("@")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Email envoyé</CardTitle>
            <CardDescription>Vérifiez votre boîte de réception</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 mb-4">
              <div className="font-semibold mb-1">Email envoyé avec succès</div>
              <div>
                Nous vous avons envoyé un lien de réinitialisation à <strong>{email}</strong>.
                Cliquez sur le lien dans l'email pour réinitialiser votre mot de passe.
              </div>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              Le lien expirera dans 1 heure.
            </div>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                Retour à la connexion
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Mot de passe oublié</CardTitle>
          <CardDescription>Entrez votre email pour réinitialiser votre mot de passe</CardDescription>
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
            <Button type="submit" disabled={!canSubmit || loading}>
              {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
            </Button>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-semibold mb-1">Erreur</div>
                <div>{error}</div>
              </div>
            )}
            <Link href="/login">
              <Button variant="ghost" className="w-full">
                Retour à la connexion
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
