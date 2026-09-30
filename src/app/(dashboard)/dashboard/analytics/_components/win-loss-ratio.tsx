"use client";

import { Cell, Pie, PieChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function WinLossRatio({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Win / loss ratio</CardTitle>
        <CardDescription>Closed deals by planned close date</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ Won: { label: "Won", color: "#16a34a" }, Lost: { label: "Lost", color: "#ef4444" } }}
          className="aspect-auto h-70 w-full"
        >
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>
              {data.map((item) => (
                <Cell key={item.name} fill={item.name === "Won" ? "#16a34a" : "#ef4444"} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ChartContainer>
        <p className="text-center text-muted-foreground text-sm">
          {total ? Math.round(((data.find((item) => item.name === "Won")?.value ?? 0) / total) * 100) : 0}% win rate ·{" "}
          {total} closed deals
        </p>
      </CardContent>
    </Card>
  );
}
