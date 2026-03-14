import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase/server"
import AppointmentsView from "./appointments-view"

export default async function AppointmentsPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/appointments")

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Rendez-vous</h1>
      <AppointmentsView />
    </div>
  )
}
