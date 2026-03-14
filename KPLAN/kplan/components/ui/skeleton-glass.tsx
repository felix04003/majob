import { cn } from "@/lib/utils"

export function SkeletonGlass({ className }: { className?: string }) {
  return <div className={cn("skeleton-glass rounded-xl", className)} aria-hidden />
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-[24px]">
      <SkeletonGlass className="mb-3 h-4 w-1/3" />
      <SkeletonGlass className="mb-2 h-8 w-1/2" />
      <SkeletonGlass className="h-3 w-2/3" />
    </div>
  )
}
