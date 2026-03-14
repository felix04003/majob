"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserPlus, UserX } from "lucide-react"

type ClientAccount = {
  id: string
  email: string
  is_revoked: boolean
  invited_at: string
  user_id: string | null
}

export default function ClientAccountsTab({ eventId }: { eventId: string }) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function fetchAccounts() {
    const res = await fetch(`/api/planner/events/${eventId}/client-accounts`)
    if (res.ok) {
      const json = await res.json()
      setAccounts(json.accounts ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [eventId])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    const res = await fetch(`/api/planner/events/${eventId}/client-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? "Erreur lors de l'invitation")
    } else {
      toast.success(`Invitation envoyée à ${inviteEmail}`)
      setInviteEmail("")
      setDialogOpen(false)
      fetchAccounts()
    }
    setInviting(false)
  }

  async function handleRevoke(accessId: string, email: string) {
    const res = await fetch(`/api/planner/events/${eventId}/client-accounts/${accessId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      toast.success(`Accès révoqué pour ${email}`)
      fetchAccounts()
    } else {
      toast.error("Erreur lors de la révocation")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Accès client</h3>
          <p className="text-sm text-muted-foreground">
            Invitez des clients à accéder à cet événement. Ils recevront un email pour créer leur mot de passe.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Inviter un client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un client</DialogTitle>
              <DialogDescription>
                Le client recevra un email lui permettant de créer son mot de passe et d&apos;accéder à l&apos;événement.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email du client</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@exemple.com"
                  required
                />
              </div>
              <Button type="submit" disabled={inviting} className="w-full">
                {inviting ? "Envoi…" : "Envoyer l'invitation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun client invité pour cet événement.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Invité le</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell className="font-medium">{acc.email}</TableCell>
                <TableCell>
                  {acc.is_revoked ? (
                    <Badge variant="destructive">Révoqué</Badge>
                  ) : acc.user_id ? (
                    <Badge variant="default">Actif</Badge>
                  ) : (
                    <Badge variant="secondary">En attente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(acc.invited_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell>
                  {!acc.is_revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(acc.id, acc.email)}
                      className="text-destructive hover:text-destructive"
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
