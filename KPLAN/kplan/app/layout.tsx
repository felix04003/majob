import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Dancing_Script } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const dancingScript = Dancing_Script({
  variable: "--font-handwriting",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "Kplan",
  description: "Planner + Client + Invités + Jour J (Next.js + Supabase)",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dancingScript.variable} antialiased`}
        style={{ background: "linear-gradient(135deg, #0A0C1A 0%, #0D1240 30%, #1A0A2A 60%, #0A1020 100%)", minHeight: "100dvh" }}
      >
        {/* Ambient gradient orbs — fixed behind all content */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -z-10"
          style={{ width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,169,110,0.25) 0%, transparent 70%)", top: -200, left: -100, filter: "blur(80px)", animation: "float1 18s ease-in-out infinite" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -z-10"
          style={{ width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(90,200,250,0.18) 0%, transparent 70%)", top: "30%", right: -150, filter: "blur(80px)", animation: "float2 22s ease-in-out infinite" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -z-10"
          style={{ width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,160,160,0.20) 0%, transparent 70%)", bottom: "10%", left: "20%", filter: "blur(80px)", animation: "float3 16s ease-in-out infinite" }}
        />

        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
