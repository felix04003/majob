import ClientNav from "@/components/client-nav"

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clientToken: string }>
}) {
  const { clientToken } = await params
  return (
    <div className="min-h-dvh">
      <ClientNav clientToken={clientToken} />
      {children}
    </div>
  )
}
