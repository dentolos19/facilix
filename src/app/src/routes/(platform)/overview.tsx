// Testing ground for sidebar to render

"use client";

import { createFileRoute } from '@tanstack/react-router'
import {SidebarProvider, SidebarInset} from "#/components/ui/sidebar"
import { AppSidebar } from '#/components/app-sidebar';
import { ChartLineDefault } from '#/components/chart-line-default';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"


export const Route = createFileRoute('/(platform)/overview')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6">Overview</h1>
        <h2 className="text-xl font-semibold mb-4">General</h2>
        <div className="flex gap-8 mb-6">
          <Card className=" w-60 text-center flex-1">
            <CardContent>
              <h1 className="text-5xl font-bold">15</h1>
            </CardContent>
            <CardHeader>
              <CardTitle>Current Personnel on Site</CardTitle>
            </CardHeader>
          </Card>
            <Card className=" w-60 text-center flex-1">
            <CardContent>
              <h1 className="text-5xl font-bold">4/6</h1>
            </CardContent>
            <CardHeader>
              <CardTitle>Loading Bays in use</CardTitle>
            </CardHeader>
          </Card>
        </div>
        <ChartLineDefault />
        <h2 className="text-xl font-semibold mt-8 mb-4">Alerts</h2>
        <div className="flex gap-8 mb-6">
          <Card className=" w-60 text-center flex-1">
            <CardContent>
              <h1 className="text-5xl font-bold">20</h1>
            </CardContent>
            <CardHeader>
              <CardTitle>Pending Security Alerts in last 24 hours</CardTitle>
            </CardHeader>
          </Card>
            <Card className=" w-60 text-center flex-1">
            <CardContent>
              <h1 className="text-5xl font-bold">5</h1>
            </CardContent>
            <CardHeader>
              <CardTitle>PPE Violations in last 24 hours</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
