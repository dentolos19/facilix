import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { PlatformTabs } from "#/components/ui/platform-tabs";
import type { DeviceDetail } from "#/lib/functions/facility";

export interface DeviceInfoProperty {
  label: string;
  value: ReactNode;
  monospace?: boolean;
}

export interface DeviceDetailShellProps {
  device: DeviceDetail;
  subtitle?: ReactNode;
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  /** Override the status shown in the badge (e.g. from a live sensor reading). */
  status?: string;
}

/**
 * Full-page device shell: header, status badge, tab bar, and a tab-content
 * area that fills the remaining viewport height.
 */
export function DeviceDetailShell({
  device,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
  status,
}: DeviceDetailShellProps) {
  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Link params={{ id: device.facilityId }} to="/facility/$id">
          <Button aria-label="Back to facility" size="icon-sm" variant="ghost">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="font-heading text-foreground truncate text-sm font-medium">{device.name}</h1>
          <p className="text-muted-foreground/60 truncate text-[11px]">
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

      <PlatformTabs activeTab={activeTab} onChange={onTabChange} tabs={tabs} />

      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}

export function DeviceDetailLayout({ device, subtitle, children, sidebar, status }: DeviceDetailLayoutProps) {
  return (
    <div className="flex h-dvh min-h-0 flex-col gap-4 p-6">
      <div className="flex shrink-0 items-center gap-3">
        <Link params={{ id: device.facilityId }} to="/facility/$id">
          <Button aria-label="Back to facility" size="icon-sm" variant="ghost">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="font-heading text-foreground truncate text-sm font-medium">{device.name}</h1>
          <p className="text-muted-foreground/60 truncate text-[11px]">
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

interface DeviceDetailLayoutProps {
  device: DeviceDetail;
  subtitle?: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
  status?: string;
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
      <DeviceInformationCard device={device} />
      <DevicePropertiesCard properties={properties} />
      {children}
    </>
  );
}

export function DeviceInformationCard({ device }: { device: DeviceDetail }) {
  return (
    <section className="border-border bg-muted/20 rounded-none border p-3">
      <h2 className="font-heading text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
        Device Information
      </h2>
      <dl className="flex flex-col gap-2 text-[11px]">
        <InfoRow label="ID" monospace value={`${device.id.slice(0, 8)}…`} />
        <InfoRow label="Type" value={device.type} />
        <InfoRow label="Status" value={device.status} />
        <InfoRow label="Facility" value={device.facilityName} />
        {device.notes && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground/60">Notes</dt>
            <dd className="text-foreground/70">{device.notes}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function DevicePropertiesCard({ properties = [] }: { properties?: DeviceInfoProperty[] }) {
  if (properties.length === 0) return null;

  return (
    <section className="border-border bg-muted/20 rounded-none border p-3">
      <h2 className="font-heading text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
        Properties
      </h2>
      <dl className="flex flex-col gap-2 text-[11px]">
        {properties.map((property) => (
          <InfoRow key={property.label} {...property} />
        ))}
      </dl>
    </section>
  );
}

function InfoRow({ label, value, monospace }: DeviceInfoProperty) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground/60 shrink-0">{label}</dt>
      <dd
        className={
          monospace ? "text-foreground/80 text-right font-mono break-all" : "text-foreground/80 text-right break-words"
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

export function DeviceStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style.bg}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}
