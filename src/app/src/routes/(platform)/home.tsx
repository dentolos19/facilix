// Testing ground for sidebar to render

"use client";

import { createFileRoute } from '@tanstack/react-router'
import {SidebarProvider} from "#/components/ui/sidebar"
import { AppSidebar } from '#/components/app-sidebar';

export const Route = createFileRoute('/(platform)/home')({
  component: RouteComponent,
})



function RouteComponent() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-4">Home</h1>
        <p className="text-muted-foreground">Welcome to the home page!</p>
      </div>
    </SidebarProvider>
  )
}
