import { Link, useLocation } from "@tanstack/react-router";
import { Building2Icon, LayoutDashboardIcon, MapIcon, SettingsIcon, ShieldIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "#/components/ui/sidebar";

const NAV_MAIN = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Overview", url: "/overview", icon: Building2Icon },
  { title: "Security", url: "/security", icon: ShieldIcon },
  { title: "Facility Panel", url: "/facility-panel", icon: MapIcon },
] as const;

const NAV_FOOTER = [{ title: "Settings", url: "/settings", icon: SettingsIcon }] as const;

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link to="/dashboard">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-none">
                  <Building2Icon />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-heading font-semibold">Facilix</span>
                  <span className="text-muted-foreground text-[10px]">Operations Center</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_MAIN.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {NAV_FOOTER.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={location.pathname === item.url} tooltip={item.title}>
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
