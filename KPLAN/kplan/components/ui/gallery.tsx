"use client"
import { Ref, forwardRef, useState, useEffect } from "react"
import Image, { ImageProps } from "next/image"
import Link from "next/link"
import { motion, useMotionValue } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export const PhotoGallery = ({ animationDelay = 0.5 }: { animationDelay?: number }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    const v = setTimeout(() => setIsVisible(true), animationDelay * 1000)
    const a = setTimeout(() => setIsLoaded(true), (animationDelay + 0.4) * 1000)
    return () => { clearTimeout(v); clearTimeout(a) }
  }, [animationDelay])

  const containerVariants = {
    hidden:  { opacity: 1 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
  }

  const photoVariants = {
    hidden:  () => ({ x: 0, y: 0, rotate: 0, scale: 1 }),
    visible: (c: { x: string; y: string; order: number }) => ({
      x: c.x, y: c.y, rotate: 0, scale: 1,
      transition: { type: "spring" as const, stiffness: 70, damping: 12, mass: 1, delay: c.order * 0.15 },
    }),
  }

  const allPhotos = [
    { id: 1, order: 0, x: "-320px", y: "15px",  xMobile: "-160px", yMobile: "8px",  zIndex: 50, direction: "left"  as const, src: "https://images.pexels.com/photos/32025694/pexels-photo-32025694/free-photo-of-romantic-wedding-in-ancient-ruins.jpeg" },
    { id: 2, order: 1, x: "-160px", y: "32px",  xMobile: "0px",    yMobile: "16px", zIndex: 40, direction: "left"  as const, src: "https://images.pexels.com/photos/31596551/pexels-photo-31596551/free-photo-of-winter-scene-with-lake-view-in-van-turkiye.jpeg" },
    { id: 3, order: 2, x: "0px",    y: "8px",   xMobile: "160px",  yMobile: "24px", zIndex: 30, direction: "right" as const, src: "https://images.pexels.com/photos/31890053/pexels-photo-31890053/free-photo-of-moody-portrait-with-heart-shaped-light.jpeg" },
    { id: 4, order: 3, x: "160px",  y: "22px",  xMobile: "160px",  yMobile: "22px", zIndex: 20, direction: "right" as const, src: "https://images.pexels.com/photos/19936068/pexels-photo-19936068/free-photo-of-women-sitting-on-hilltop-with-clouds-below.jpeg" },
    { id: 5, order: 4, x: "320px",  y: "44px",  xMobile: "320px",  yMobile: "44px", zIndex: 10, direction: "left"  as const, src: "https://images.pexels.com/photos/20494995/pexels-photo-20494995/free-photo-of-head-of-peacock.jpeg" },
  ]
  const photos = isMobile ? allPhotos.slice(0, 3) : allPhotos
  const photoSize = isMobile ? 160 : 220

  return (
    <div
      className="mt-40 relative rounded-3xl px-4 py-8"
      style={{ backdropFilter: "blur(24px) saturate(180%)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Background grid accent */}
      <div className="absolute inset-0 max-md:hidden top-[200px] -z-10 h-[300px] w-full bg-[linear-gradient(to_right,#C9A96E_1px,transparent_1px),linear-gradient(to_bottom,#C9A96E_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-10 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <p className="lg:text-md my-2 text-center text-xs font-light uppercase tracking-widest text-kplan-gold">
        Événements organisés avec Kplan
      </p>
      <h3
        className="z-20 mx-auto max-w-2xl justify-center bg-clip-text py-3 text-center text-4xl text-transparent md:text-6xl"
        style={{ backgroundImage: "linear-gradient(160deg, #ffffff 0%, #C9A96E 50%, #E8A0A0 100%)" }}
      >
        Nos <span style={{ fontFamily: "var(--font-dancing)", fontStyle: "italic" }}>événements</span>
      </h3>

      <div className="relative mb-8 h-[350px] w-full items-center justify-center lg:flex">
        <motion.div
          className="relative mx-auto flex w-full max-w-7xl justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: isVisible ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <motion.div
            className="relative flex w-full justify-center"
            variants={containerVariants}
            initial="hidden"
            animate={isLoaded ? "visible" : "hidden"}
          >
            <div className="relative" style={{ height: photoSize, width: photoSize }}>
              {[...photos].reverse().map((photo) => (
                <motion.div
                  key={photo.id}
                  className="absolute left-0 top-0"
                  style={{ zIndex: photo.zIndex }}
                  variants={photoVariants}
                  custom={{ x: isMobile ? photo.xMobile : photo.x, y: isMobile ? photo.yMobile : photo.y, order: photo.order }}
                >
                  <Photo width={photoSize} height={photoSize} src={photo.src} alt="Événement organisé par Kplan" direction={photo.direction} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="flex w-full justify-center">
        <Link href="/references">
          <Button
            className="rounded-full px-8 py-6 text-sm font-medium border-0"
            style={{ background: "linear-gradient(135deg, #C9A96E, #E8A0A0)", color: "#0A0C1A", minHeight: 44 }}
          >
            Voir tous nos événements →
          </Button>
        </Link>
      </div>
    </div>
  )
}

function getRandomNumberInRange(min: number, max: number): number {
  if (min >= max) throw new Error("Min value should be less than max value")
  return Math.random() * (max - min) + min
}

const MotionImage = motion(forwardRef(function MotionImage(props: ImageProps, ref: Ref<HTMLImageElement>) {
  return <Image ref={ref} {...props} />
}))

type Direction = "left" | "right"

export const Photo = ({ src, alt, className, direction, width, height }: {
  src: string; alt: string; className?: string; direction?: Direction; width: number; height: number
}) => {
  const [rotation, setRotation] = useState(0)
  const x = useMotionValue(200)
  const y = useMotionValue(200)

  useEffect(() => { setRotation(getRandomNumberInRange(1, 4) * (direction === "left" ? -1 : 1)) }, [direction])

  return (
    <motion.div
      drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      whileTap={{ scale: 1.2, zIndex: 9999 }}
      whileHover={{ scale: 1.1, rotateZ: 2 * (direction === "left" ? -1 : 1), zIndex: 9999 }}
      whileDrag={{ scale: 1.1, zIndex: 9999 }}
      initial={{ rotate: 0 }} animate={{ rotate: rotation }}
      style={{ width, height, perspective: 400, zIndex: 1, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", touchAction: "none" }}
      className={cn(className, "relative mx-auto shrink-0 cursor-grab active:cursor-grabbing")}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set(e.clientX - r.left); y.set(e.clientY - r.top) }}
      onMouseLeave={() => { x.set(200); y.set(200) }}
      draggable={false} tabIndex={0}
    >
      <div className="relative h-full w-full overflow-hidden rounded-3xl" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)" }}>
        <MotionImage className="rounded-3xl object-cover" fill src={src} alt={alt} draggable={false} />
        <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 60%)" }} />
      </div>
    </motion.div>
  )
}
