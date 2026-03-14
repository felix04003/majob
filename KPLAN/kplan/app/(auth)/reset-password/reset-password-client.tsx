"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseBrowser } from "@/lib/supabase/browser"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function ResetPasswordClient() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canSubmit = newPassword.length >= 8 && newPassword === confirmPassword

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    setLoading(false)
    if (error) {
      let errorMessage = error.message
      if (error.message.includes("Same password")) {
        errorMessage = "Le nouveau mot de passe doit être différent de l'ancien"
      }
      setError(errorMessage)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push("/dashboard")
      router.refresh()
    }, 2000)
  }

  if (success) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Mot de passe modifié</CardTitle>
            <CardDescription>Votre mot de passe a été mis à jour avec succès</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <div className="font-semibold mb-1">Succès</div>
              <div>Redirection vers le tableau de bord...</div>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Réinitialiser le mot de passe</CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (min. 8 caractères)"
              type="password"
              autoComplete="new-password"
            />
            <Input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmer le mot de passe"
              type="password"
              autoComplete="new-password"
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <div className="text-sm text-red-600">
                Les mots de passe ne correspondent pas
              </div>
            )}
            <Button type="submit" disabled={!canSubmit || loading}>
              {loading ? "Modification…" : "Modifier le mot de passe"}
            </Button>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-semibold mb-1">Erreur</div>
                <div>{error}</div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
