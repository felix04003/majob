"use client"

import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  const isSupabaseEnv = /Supabase env manquante|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY/i.test(
    error.message
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Erreur application</CardTitle>
          <CardDescription>Un problème côté serveur est survenu.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isSupabaseEnv ? (
            <div className="text-sm">
              <div className="font-medium">Supabase n’est pas configuré dans l’environnement.</div>
              <div className="text-muted-foreground">
                Ajoute les variables dans <code>.env.local</code> puis redémarre <code>npm run dev</code>.
              </div>
            </div>
          ) : null}

          <div className="rounded-md bg-muted p-3 text-xs">
            <div className="font-medium">Message</div>
            <div className="whitespace-pre-wrap">{error.message}</div>
            {error.digest ? (
              <div className="mt-2 text-muted-foreground">
                Digest: <code>{error.digest}</code>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => reset()}>Réessayer</Button>
            <Button variant="outline" onClick={() => location.reload()}>
              Recharger
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}


