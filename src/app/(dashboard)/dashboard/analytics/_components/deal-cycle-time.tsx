"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function DealCycleTime({ data }: { data: { period: string; days: number | null }[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Deal cycle time</CardTitle>
        <CardDescription>
          Average days from creation to planned close for won deals; stage transition history is unavailable
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ days: { label: "Days", color: "#8b5cf6" } }} className="aspect-auto h-70 w-full">
          <LineChart data={data} margin={{ left: 0, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis tickLine={false} axisLine={false} unit="d" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              dataKey="days"
              type="monotone"
              stroke="var(--color-days)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
