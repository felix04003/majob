import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  CalendarDays,
  Users,
  QrCode,
  LayoutGrid,
  Bell,
  ClipboardCheck,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react"

const features = [
  {
    icon: CalendarDays,
    title: "Gestion d'événements",
    description:
      "Créez et gérez vos événements de A à Z. Timeline, budget, prestataires — tout au même endroit.",
  },
  {
    icon: Users,
    title: "Portail client collaboratif",
    description:
      "Vos clients proposent des invités et modifications, validées par vous sous 4h via un SLA intégré.",
  },
  {
    icon: LayoutGrid,
    title: "Plan de table interactif",
    description:
      "Placez vos invités par glisser-déposer sur mobile ou desktop. Visualisez en 3D avant le jour J.",
  },
  {
    icon: QrCode,
    title: "Check-in Jour J",
    description:
      "Scannez les QR codes des invités à l'entrée. Dashboard temps réel des arrivées et taux de présence.",
  },
  {
    icon: Bell,
    title: "Notifications temps réel",
    description:
      "Soyez alerté instantanément des nouvelles demandes, validations et rappels grâce à Supabase Realtime.",
  },
  {
    icon: ClipboardCheck,
    title: "Checklist Jour J",
    description:
      "Liste de tâches chronologique avec assignation par équipier. Suivi en direct de la progression.",
  },
]

const steps = [
  {
    step: "01",
    title: "Créez votre événement",
    description: "Définissez la date, le lieu, le budget et les détails de votre événement en quelques clics.",
  },
  {
    step: "02",
    title: "Invitez et collaborez",
    description: "Partagez un lien client pour que vos clients proposent invités et modifications. Vous gardez le contrôle.",
  },
  {
    step: "03",
    title: "Gérez le Jour J",
    description: "Scannez les QR codes, suivez les arrivées en temps réel et cochez vos tâches depuis votre mobile.",
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ─── Navbar ─── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Kplan
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Connexion</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">
                Commencer
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" />
        <div className="absolute -top-40 left-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center md:pb-24 md:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Planification événementielle nouvelle génération
          </div>

          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Organisez vos événements{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              sans stress
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Kplan réunit planification, collaboration client, plan de table 3D
            et gestion du jour J dans un seul outil.
            Conçu pour les wedding planners et organisateurs professionnels.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/login">
                Accéder à mon espace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#features">Découvrir les fonctionnalités</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="border-t bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              Tout ce dont vous avez besoin
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              De la première réunion au dernier invité scanné — Kplan couvre chaque
              étape de votre événement.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border bg-background p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              Comment ça marche
            </h2>
            <p className="text-muted-foreground">
              Trois étapes pour un événement réussi.
            </p>
          </div>

          <div className="space-y-8 md:space-y-0 md:grid md:grid-cols-3 md:gap-8">
            {steps.map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Highlights ─── */}
      <section className="border-t bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              Pourquoi choisir Kplan
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "SLA 4h garanti sur les demandes client",
              "Plan de table 3D avec drag-and-drop",
              "QR code unique par invité",
              "Dashboard temps réel le jour J",
              "Notifications instantanées (Realtime)",
              "100% responsive, conçu pour mobile",
              "Collaboration planner-client fluide",
              "Hébergé sur Supabase, rapide et sécurisé",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-lg border bg-background p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            Prêt à simplifier vos événements ?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Rejoignez les organisateurs qui gèrent leurs événements avec sérénité grâce à Kplan.
          </p>
          <Button size="lg" asChild>
            <Link href="/login">
              Commencer gratuitement
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Kplan. Tous droits réservés.
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Connexion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
