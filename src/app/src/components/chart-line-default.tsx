"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart"

export const description = "A line chart"

const chartData = [
  { time: "00:00", temperature: 22.4 },
  { time: "01:00", temperature: 22.1 },
  { time: "02:00", temperature: 21.9 },
  { time: "03:00", temperature: 21.8 },
  { time: "04:00", temperature: 21.7 },
  { time: "05:00", temperature: 21.9 },
  { time: "06:00", temperature: 22.3 },
  { time: "07:00", temperature: 23.0 },
  { time: "08:00", temperature: 23.8 },
  { time: "09:00", temperature: 24.6 },
  { time: "10:00", temperature: 25.2 },
  { time: "11:00", temperature: 25.8 },
  { time: "12:00", temperature: 26.3 },
  { time: "13:00", temperature: 26.7 },
  { time: "14:00", temperature: 27.0 },
  { time: "15:00", temperature: 26.8 },
  { time: "16:00", temperature: 26.4 },
  { time: "17:00", temperature: 25.9 },
  { time: "18:00", temperature: 25.3 },
  { time: "19:00", temperature: 24.8 },
  { time: "20:00", temperature: 24.2 },
  { time: "21:00", temperature: 23.7 },
  { time: "22:00", temperature: 23.2 },
  { time: "23:00", temperature: 22.8 },
];

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ChartLineDefault() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Average Temperature over last 24 hours</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                domain={["dataMin - 1", "dataMax + 1"]}
                label={{
                value: "Temperature (°C)",
                angle: -90,
                position: "insideLeft",
                }}
            />
            <Line
              dataKey="temperature"
              type="natural"
              stroke="var(--color-desktop)"
              strokeWidth={2}
              dot={false}
              
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
