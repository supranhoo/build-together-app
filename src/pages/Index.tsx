import heroImage from "@/assets/steel-plant-hero.jpg";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Factory, ShieldCheck, Warehouse } from "lucide-react";
import { BFCLLogo } from "@/components/BFCLLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const metrics = [
  { label: "Configurable workspaces", value: "Multi-plant ready" },
  { label: "Module governance", value: "Backend-driven" },
  { label: "Admin surfaces", value: "5 control areas" },
];

const modules = [
  {
    title: "Inventory",
    text: "Workspace-controlled material visibility, stock movement, and traceability foundations.",
    icon: Warehouse,
  },
  {
    title: "Production",
    text: "Plant-specific production flows can scale later without rewriting the shell or access model.",
    icon: Factory,
  },
  {
    title: "Reports",
    text: "Reporting access and naming now originate from configuration rather than fixed navigation constants.",
    icon: BarChart3,
  },
];

const trustPoints = [
  "Admin-created accounts only",
  "Workspace-aware access after sign in",
  "Configuration-first ERP foundation for multi-plant scale",
];

export default function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative isolate overflow-hidden border-b border-border">
        <img src={heroImage} alt="Steel plant operations floor with molten metal pouring" className="absolute inset-0 -z-20 h-full w-full object-cover" width={1920} height={1080} />
        <div className="absolute inset-0 -z-10 bg-hero-overlay" />
        <div className="surface-grid absolute inset-0 -z-10 opacity-30" />

        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4 py-4">
            <BFCLLogo className="w-40 sm:w-48" theme="dark" />
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" className="hidden border border-white/10 bg-white/5 text-white hover:bg-white/10 sm:inline-flex">
                <Link to="/login">Employee sign in</Link>
              </Button>
              <Button asChild className="shadow-signal">
                <Link to="/login">Access portal <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.2fr_0.72fr] lg:py-16">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">BFCL employee portal</p>
              <h1 className="mt-6 text-5xl font-semibold leading-[0.92] text-white sm:text-6xl xl:text-7xl">
                Configurable plant access built for multi-workspace scale.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76 sm:text-xl">
                SteelFlow ERP now routes authenticated users through assigned workspaces so plants, modules, labels, and future process variations can grow from configuration instead of hardcoded portal behavior.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button asChild size="lg" className="h-12 gap-2 px-6 shadow-signal">
                  <Link to="/login">Enter employee portal <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </div>

            <Card className="border-white/10 bg-card/88 shadow-panel backdrop-blur">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Portal readiness</p>
                    <h2 className="mt-3 text-2xl text-foreground">Configuration-first operating shell</h2>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-primary/12 p-3 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-md border border-border bg-panel px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                      <p className="mt-3 text-2xl font-semibold">{metric.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  {trustPoints.map((item) => (
                    <div key={item} className="rounded-md border border-border bg-panel px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {modules.map((module) => (
              <article key={module.title} className="bg-panel-gradient rounded-md border border-white/10 p-6 shadow-panel">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <module.icon className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-2xl text-white">{module.title}</h2>
                <p className="mt-3 text-sm leading-7 text-white/68">{module.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
