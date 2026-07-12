"use client";

import { createFileRoute } from '@tanstack/react-router'
import {SidebarProvider, SidebarInset} from "#/components/ui/sidebar"
import { AppSidebar } from '#/components/app-sidebar';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Button } from '#/components/ui/button';


export const Route = createFileRoute('/(platform)/security')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
            <div className="flex-1 p-8">
                <h1 className="text-3xl font-bold mb-6">Security</h1>
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
                    <h1 className="text-5xl font-bold">50</h1>
                    </CardContent>
                    <CardHeader>
                    <CardTitle>Security Alerts in last 24 hours</CardTitle>
                    </CardHeader>
                </Card>
                </div>
                <h2 className="text-xl font-semibold mb-4">Recent Pending Security Logs</h2><Button variant="default" className="mb-4">View All</Button>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Log ID</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Personnel</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Activity</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell>LOG-1009</TableCell>
                            <TableCell>09:41:18</TableCell>
                            <TableCell>NA</TableCell>
                            <TableCell>NA</TableCell>
                            <TableCell>Person loitering near Loading Bay B</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell>LOG-1003</TableCell>
                            <TableCell>08:26:33</TableCell>
                            <TableCell>Sarah Lim</TableCell>
                            <TableCell>Quality Inspector</TableCell>
                            <TableCell>Attempted to enter restricted Operations zone</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell>LOG-1006</TableCell>
                            <TableCell>09:02:41</TableCell>
                            <TableCell>NA</TableCell>
                            <TableCell>NA</TableCell>
                            <TableCell>Fire detected in operations zone</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </SidebarInset>
    </SidebarProvider>
  )
}
