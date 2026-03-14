import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase/server"
import NotificationsList from "./notifications-list"

export default async function NotificationsPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/notifications")

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <NotificationsList />
    </div>
  )
}
