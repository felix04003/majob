import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase/server"
import EventDetail from "./planner-event-detail"

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/events")

  const { eventId } = await params
  return (
    <div className="flex flex-col gap-6">
      <EventDetail eventId={eventId} />
    </div>
  )
}


