import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Brain,
  Camera,
  ChevronRight,
  Container,
  Factory,
  Layers,
  LayoutDashboard,
  Map,
  Shield,
  Thermometer,
  Wifi,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { useSession } from "#/lib/auth/client";

export const Route = createFileRoute("/")({ component: Home });

const features = [
  {
    title: "Floorplan Mapping",
    description:
      "Upload factory blueprints or CAD layouts and place devices directly on the map. Drag, scale, and align with your real facility.",
    icon: Map,
  },
  {
    title: "Virtual CCTV Cameras",
    description:
      "Deploy simulated cameras across your floorplan, configure detection zones, and preview AI-powered object recognition and motion alerts.",
    icon: Camera,
  },
  {
    title: "Environmental Sensors",
    description:
      "Monitor temperature, humidity, air quality, and vibration across production zones. Set thresholds and watch real-time telemetry streams.",
    icon: Thermometer,
  },
  {
    title: "Loading Bay Trackers",
    description:
      "Track truck arrivals, dock occupancy, and loading status. Flag delays and coordinate logistics from a single pane.",
    icon: Container,
  },
  {
    title: "Gateways & Zones",
    description:
      "Define network gateways, communication zones, and coverage areas. Visualize signal strength and device connectivity across the facility.",
    icon: Wifi,
  },
  {
    title: "Alert Markers",
    description:
      "Place alert markers for security incidents, equipment faults, or safety hazards. Escalate and route notifications to the right team.",
    icon: Bell,
  },
];

const steps = [
  {
    step: "01",
    title: "Upload your floorplan",
    description:
      "Drop in a PDF, PNG, or CAD file of your factory layout. Facilix processes it into a scalable interactive canvas.",
  },
  {
    step: "02",
    title: "Place & configure devices",
    description:
      "Drag CCTV cameras, sensors, gateways, and trackers onto the map. Set behavior rules, thresholds, and alert conditions.",
  },
  {
    step: "03",
    title: "Monitor in real time",
    description:
      "Watch live status updates, environmental readings, security alerts, and logistics events — all overlaid on your digital twin.",
  },
];

function Home() {
  const { data: session } = useSession();

  return (
    <div className="flex flex-col">
      {/* ──────── Navigation ──────── */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm md:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-primary text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
            Fx
          </div>
          <span className="text-sm font-semibold tracking-tight">Facilix</span>
        </div>
        <nav className="flex items-center gap-3">
          {session ? (
            <Button asChild size="sm">
              <Link to="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link search={{ mode: "login" }} to="/auth">
                  Sign in
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link search={{ mode: "signup" }} to="/auth">
                  Get started
                </Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* ──────── Hero ──────── */}
      <section className="relative overflow-hidden border-b border-border">
        {/* Background pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none opacity-[0.03] dark:opacity-[0.06]"
          style={{
            backgroundImage: `
              linear-gradient(90deg, currentColor 1px, transparent 0),
              linear-gradient(180deg, currentColor 1px, transparent 0)
            `,
            backgroundSize: "64px 64px",
          }}
        />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3.5 py-1 text-xs font-medium text-muted-foreground">
            <Brain className="h-3.5 w-3.5" />
            AI-powered digital twin platform
          </div>

          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
            Your factory floor,
            <br />
            <span className="text-muted-foreground">intelligently mapped</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Upload your floorplan, place virtual CCTV cameras, sensors, gateways, and alert markers — then simulate
            real-time device statuses, environmental readings, and security events in a living digital twin of your
            facility.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {session ? (
              <Button asChild size="lg">
                <Link to="/auth">
                  Open dashboard <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link search={{ mode: "signup" }} to="/auth">
                    Start mapping your factory <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link search={{ mode: "login" }} to="/auth">
                    Sign in
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ──────── Features ──────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
        <div className="mb-14 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
            Everything you need to monitor your facility
          </h2>
          <p className="mt-3 text-muted-foreground">
            A unified canvas for floorplan-based device management and live operations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors hover:border-border/80"
                key={feature.title}
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/50">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="font-heading text-sm font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ──────── How it works ──────── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="mb-14 text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">From blueprint to live view</h2>
            <p className="mt-3 text-muted-foreground">Three steps to get your digital twin running.</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div className="relative" key={step.step}>
                <span className="font-heading text-5xl font-bold tracking-tighter text-muted-foreground/20">
                  {step.step}
                </span>
                <h3 className="mt-2 font-heading text-base font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── Stats / value props ──────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Devices per floorplan", value: "Unlimited", icon: Layers },
            { label: "AI detection models", value: "Custom", icon: Brain },
            { label: "Alert response time", value: "< 1s", icon: Activity },
            { label: "Facility types", value: "Any", icon: Factory },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div className="rounded-xl border border-border bg-card p-5 text-center" key={stat.label}>
                <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-3 font-heading text-2xl font-bold tracking-tight">{stat.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ──────── Security note ──────── */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-16 text-center md:py-20">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card">
            <Shield className="h-6 w-6 text-foreground" />
          </div>
          <h2 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Built for operational security</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Role-based access, encrypted telemetry, and on-premises deployment options. Facilix is designed from the
            ground up for food safety compliance and industrial security requirements.
          </p>
          <Button asChild className="mt-6" size="sm" variant="outline">
            <Link search={{ mode: "signup" }} to="/auth">
              Start building <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ──────── Footer ──────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Dennise Catolos. All rights reserved.</span>
          <span className="hidden sm:inline">Made for Nanyang Polytechnic and SCCCI</span>
        </div>
      </footer>
    </div>
  );
}
