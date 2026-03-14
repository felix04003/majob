"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { label: "Invités", path: "guests" },
  { label: "Tâches", path: "tasks" },
  { label: "Rendez-vous", path: "appointments" },
]

export default function ClientNav({ clientToken }: { clientToken: string }) {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="py-3 text-sm font-semibold text-primary">
          Kplan
        </Link>
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const href = `/c/${clientToken}/${tab.path}`
            const isActive = pathname.includes(`/${tab.path}`)
            return (
              <Link
                key={tab.path}
                href={href}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
