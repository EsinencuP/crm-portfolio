"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function PipelineFunnelChart({ data }: { data: { stage: string; color: string; count: number }[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Pipeline funnel</CardTitle>
        <CardDescription>Deals created in the selected period by current stage</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: "Deals", color: "#6366f1" } }} className="aspect-auto h-70 w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis dataKey="stage" type="category" width={100} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((item) => (
                <Cell key={item.stage} fill={item.color} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
