import { redirect } from "next/navigation"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabaseServer } from "@/lib/supabase/server"
import SeedPanel from "./seed-panel"
import DashboardStats from "./dashboard-stats"

export default async function DashboardPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/dashboard")

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Planner</CardTitle>
          <CardDescription>Interface de gestion complète de vos événements.</CardDescription>
        </CardHeader>
      </Card>

      <DashboardStats />

      <SeedPanel />
    </div>
  )
}


