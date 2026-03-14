import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase/server"
import SeedPanel from "./seed-panel"
import DashboardStats from "./dashboard-stats"

export default async function DashboardPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/dashboard")

  return (
    <div className="flex flex-col gap-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white/95">
          Bonjour{" "}
          <span style={{ fontFamily: "var(--font-dancing)", color: "var(--kplan-gold)", fontSize: "1.5em", lineHeight: 1 }}>
            Planner
          </span>{" "}
          👋
        </h1>
        <p className="text-sm text-white/45">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <DashboardStats />

      <SeedPanel />
    </div>
  )
}
