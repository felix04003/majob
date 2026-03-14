import PlannerNavbar from "@/components/planner-navbar"
import { NotificationProvider } from "@/components/notification-provider"

export default function PlannerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <NotificationProvider>
      <div className="min-h-dvh">
        <PlannerNavbar />
        <div className="mx-auto max-w-6xl px-6 py-6">
          {children}
        </div>
      </div>
    </NotificationProvider>
  )
}
