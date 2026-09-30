"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function RevenueOverTime({ data, currency }: { data: { period: string; value: number }[]; currency: string }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Won revenue over time</CardTitle>
        <CardDescription>Closed Won deal value by planned close month · {currency}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ value: { label: "Won revenue", color: "#16a34a" } }}
          className="aspect-auto h-70 w-full"
        >
          <AreaChart data={data} margin={{ left: 0, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              fill="var(--color-value)"
              fillOpacity={0.22}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
