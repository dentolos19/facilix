import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

import { AppSidebar } from "./-components/app-sidebar";

export const Route = createFileRoute("/(platform)/(dashboard)")({
  component: Layout,
});

function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
