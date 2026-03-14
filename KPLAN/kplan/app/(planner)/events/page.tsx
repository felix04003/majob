import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase/server"
import EventsTableEnhanced from "./events-table-enhanced"

export default async function EventsPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/events")

  return (
    <div className="flex flex-col gap-6">
      <EventsTableEnhanced />
    </div>
  )
}


