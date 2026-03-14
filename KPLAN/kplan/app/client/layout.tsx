export default function ClientAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        {children}
      </div>
    </div>
  )
}
