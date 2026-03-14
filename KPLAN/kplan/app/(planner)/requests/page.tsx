import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase/server"
import RequestsTable from "./requests-table"

export default async function RequestsPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/requests")

  return (
    <div className="flex flex-col gap-6">
      <RequestsTable />
    </div>
  )
}


