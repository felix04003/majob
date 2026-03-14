import { NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServerClient } from "@supabase/ssr"

// Pages that don't require a session
const CLIENT_AUTH_PAGES = ["/client/login", "/client/forgot-password", "/client/reset-password", "/client/set-password"]

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  const path = request.nextUrl.pathname

  // Protect /client/* routes
  if (path.startsWith("/client")) {
    const isAuthPage = CLIENT_AUTH_PAGES.some((p) => path === p || path.startsWith(p + "/"))
    if (!isAuthPage) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (url && anon) {
        const supabase = createServerClient(url, anon, {
          cookies: {
            getAll() { return request.cookies.getAll() },
            setAll() {},
          },
        })
        const { data } = await supabase.auth.getUser()
        if (!data?.user) {
          const loginUrl = new URL("/client/login", request.url)
          loginUrl.searchParams.set("next", path)
          return NextResponse.redirect(loginUrl)
        }
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
