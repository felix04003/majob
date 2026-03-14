"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X, Bell } from "lucide-react"
import { useNotifications } from "@/components/notification-provider"

export default function PlannerNavbar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const { unreadCount } = useNotifications()

  const navLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Événements", href: "/events" },
    { label: "Rendez-vous", href: "/appointments" },
    { label: "Demandes", href: "/requests" },
    { label: "Scanner", href: "/dayof" },
  ]

  const isActive = (href: string) => pathname === href

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center">
            <span className="text-xl font-bold text-foreground">Kplan</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  isActive(link.href)
                    ? "font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop: Bell + Logout */}
          <div className="hidden items-center gap-3 md:flex">
            {/* Notification Bell */}
            <Link
              href="/notifications"
              className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-in zoom-in-50">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <form action="/api/auth/logout" method="POST">
              <Button type="submit" variant="outline" size="sm">
                Logout
              </Button>
            </form>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            {/* Mobile notification bell */}
            <Link
              href="/notifications"
              className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? (
                <X className="h-6 w-6 text-foreground" />
              ) : (
                <Menu className="h-6 w-6 text-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="mt-4 space-y-3 border-t border-border pt-4 md:hidden">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`block py-2 text-sm transition-colors ${
                  isActive(link.href)
                    ? "font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-2 py-2 text-sm transition-colors ${
                isActive("/notifications")
                  ? "font-bold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Notifications
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <div className="border-t border-border pt-3">
              <form action="/api/auth/logout" method="POST">
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Logout
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
