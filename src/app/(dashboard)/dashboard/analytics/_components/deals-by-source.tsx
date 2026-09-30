"use client";

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function DealsBySource({ data }: { data: { source: string; won: number; lost: number; open: number }[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Deals by source</CardTitle>
        <CardDescription>Contact source and current deal outcome</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            won: { label: "Won", color: "#16a34a" },
            lost: { label: "Lost", color: "#ef4444" },
            open: { label: "Open", color: "#6366f1" },
          }}
          className="aspect-auto h-70 w-full"
        >
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="source" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
            <Bar dataKey="won" stackId="deals" fill="var(--color-won)" />
            <Bar dataKey="lost" stackId="deals" fill="var(--color-lost)" />
            <Bar dataKey="open" stackId="deals" fill="var(--color-open)" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
