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

export const Route = createFileRoute("/(public)/")({ component: Home });

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
      <header className="border-border bg-background/80 sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6 backdrop-blur-sm md:px-10">
        <div className="flex items-center gap-2">
          <img alt="Facilix" className="h-6 w-6 rounded-lg" src="/icon.png" />
          <span className="text-base font-semibold tracking-tight">Facilix</span>
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
                <Link search={{ mode: "register" }} to="/auth">
                  Get started
                </Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* ──────── Hero ──────── */}
      <section className="border-border relative overflow-hidden border-b">
        {/* Background pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03] select-none dark:opacity-[0.06]"
          style={{
            backgroundImage: `
              linear-gradient(90deg, currentColor 1px, transparent 0),
              linear-gradient(180deg, currentColor 1px, transparent 0)
            `,
            backgroundSize: "64px 64px",
          }}
        />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pt-20 pb-24 text-center md:pt-28 md:pb-32">
          <div className="border-border bg-muted/50 text-muted-foreground mb-6 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium">
            <Brain className="h-3.5 w-3.5" />
            AI-powered digital twin platform
          </div>

          <h1 className="font-heading text-4xl leading-[1.1] font-bold tracking-tight md:text-6xl lg:text-7xl">
            Your factory floor,
            <br />
            <span className="text-muted-foreground">intelligently mapped</span>
          </h1>

          <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed md:text-lg">
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
                  <Link search={{ mode: "register" }} to="/auth">
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
          <p className="text-muted-foreground mt-3">
            A unified canvas for floorplan-based device management and live operations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                className="group border-border bg-card hover:border-border/80 relative overflow-hidden rounded-xl border p-6 transition-colors"
                key={feature.title}
              >
                <div className="border-border bg-muted/50 mb-4 flex h-10 w-10 items-center justify-center rounded-lg border">
                  <Icon className="text-foreground h-5 w-5" />
                </div>
                <h3 className="font-heading text-sm font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ──────── How it works ──────── */}
      <section className="border-border bg-muted/30 border-y">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="mb-14 text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">From blueprint to live view</h2>
            <p className="text-muted-foreground mt-3">Three steps to get your digital twin running.</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div className="relative" key={step.step}>
                <span className="font-heading text-muted-foreground/20 text-5xl font-bold tracking-tighter">
                  {step.step}
                </span>
                <h3 className="font-heading mt-2 text-base font-semibold tracking-tight">{step.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.description}</p>
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
              <div className="border-border bg-card rounded-xl border p-5 text-center" key={stat.label}>
                <Icon className="text-muted-foreground mx-auto h-5 w-5" />
                <p className="font-heading mt-3 text-2xl font-bold tracking-tight">{stat.value}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ──────── Security note ──────── */}
      <section className="border-border bg-muted/30 border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-16 text-center md:py-20">
          <div className="border-border bg-card mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
            <Shield className="text-foreground h-6 w-6" />
          </div>
          <h2 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Built for operational security</h2>
          <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-relaxed">
            Role-based access, encrypted telemetry, and on-premises deployment options. Facilix is designed from the
            ground up for food safety compliance and industrial security requirements.
          </p>
          <Button asChild className="mt-6" size="sm" variant="outline">
            <Link search={{ mode: "register" }} to="/auth">
              Start building <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ──────── Footer ──────── */}
      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs">
          <span>© {new Date().getFullYear()} Dennise Catolos. All rights reserved.</span>
          <span className="hidden sm:inline">Made with Alibaba Cloud and Qwen</span>
        </div>
      </footer>
    </div>
  );
}
