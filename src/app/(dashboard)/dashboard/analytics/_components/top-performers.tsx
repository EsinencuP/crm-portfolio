"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function TopPerformers({ data, currency }: { data: { name: string; amount: number }[]; currency: string }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Top performers</CardTitle>
        <CardDescription>Won deal value by owner · {currency}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ amount: { label: "Won value", color: "#0ea5e9" } }}
          className="aspect-auto h-70 w-full"
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value: number) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}
            />
            <YAxis dataKey="name" type="category" width={95} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
