import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/src/components/ui/button";
import type { DeviceDetail } from "#/src/lib/functions/facility";

export interface DeviceInfoProperty {
  label: string;
  value: ReactNode;
  monospace?: boolean;
}

interface DeviceDetailLayoutProps {
  device: DeviceDetail;
  subtitle?: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
  /** Override the status shown in the badge (e.g. from a live sensor reading). */
  status?: string;
}

export function DeviceDetailLayout({ device, subtitle, children, sidebar, status }: DeviceDetailLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex shrink-0 items-center gap-3">
        <Link params={{ id: device.facilityId }} to="/facility/$id">
          <Button aria-label="Back to facility" size="icon-sm" variant="ghost">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-sm font-medium text-foreground">{device.name}</h1>
          <p className="truncate text-[11px] text-muted-foreground/60">
            {subtitle ?? (
              <>
                {device.facilityName} &middot; {device.type}
              </>
            )}
          </p>
        </div>
        <div className="ml-auto">
          <DeviceStatusBadge status={status ?? device.status} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <main className="min-w-0 flex-1">{children}</main>
        {sidebar && <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">{sidebar}</aside>}
      </div>
    </div>
  );
}

export function DeviceDetailSidebar({
  device,
  properties,
  children,
}: {
  device: DeviceDetail;
  properties?: DeviceInfoProperty[];
  children?: ReactNode;
}) {
  return (
    <>
      <DeviceInformationCard device={device} properties={properties} />
      {children}
    </>
  );
}

function DeviceInformationCard({
  device,
  properties = [],
}: {
  device: DeviceDetail;
  properties?: DeviceInfoProperty[];
}) {
  return (
    <section className="rounded-none border border-border bg-muted/20 p-3">
      <h2 className="mb-2 font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Device Information
      </h2>
      <dl className="flex flex-col gap-2 text-[11px]">
        <InfoRow label="ID" monospace value={`${device.id.slice(0, 8)}…`} />
        <InfoRow label="Type" value={device.type} />
        <InfoRow label="Status" value={device.status} />
        <InfoRow label="Facility" value={device.facilityName} />
        {properties.map((property) => (
          <InfoRow key={property.label} {...property} />
        ))}
        {device.notes && (
          <div className="mt-1 flex flex-col gap-0.5 border-t border-border pt-2">
            <dt className="text-muted-foreground/60">Notes</dt>
            <dd className="text-foreground/70">{device.notes}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function InfoRow({ label, value, monospace }: DeviceInfoProperty) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground/60">{label}</dt>
      <dd
        className={
          monospace ? "break-all text-right font-mono text-foreground/80" : "break-words text-right text-foreground/80"
        }
      >
        {value}
      </dd>
    </div>
  );
}

const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  online: { bg: "bg-green-500/10 text-green-600", dot: "bg-green-500" },
  degraded: { bg: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  error: { bg: "bg-red-500/10 text-red-600", dot: "bg-red-500" },
  offline: { bg: "bg-red-500/10 text-red-600", dot: "bg-red-500" },
};

function DeviceStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" };

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style.bg}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}
