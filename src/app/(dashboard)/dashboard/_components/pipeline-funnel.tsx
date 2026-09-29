"use client";

import { Bar, BarChart, type BarShapeProps, CartesianGrid, LabelList, Rectangle, Text, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export type PipelineFunnelDatum = {
  stage: string;
  count: number;
  value: number;
  color: string;
  id?: string;
  // Four-field inputs use USD; the server supplies a breakdown for multi-currency deals.
  valueByCurrency?: { currency: string; value: number }[];
};

const chartConfig = {
  count: { label: "Deals", color: "var(--chart-2)" },
} satisfies ChartConfig;
const countFormatter = new Intl.NumberFormat("en-US");
const axisFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function formatAmount(value: number, currency: string) {
  const code = currency.trim().toUpperCase();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: code === "USD" ? "symbol" : "code",
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "Unspecified currency"} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
  }
}

function formatStageValue(entry: PipelineFunnelDatum) {
  if (entry.valueByCurrency === undefined) return formatAmount(entry.value, "USD");
  if (entry.valueByCurrency.length === 0) return "0";

  return entry.valueByCurrency.map(({ currency, value }) => formatAmount(value, currency)).join(" · ");
}

function StageTick({
  x = 0,
  y = 0,
  className,
  payload,
}: {
  x?: number;
  y?: number;
  className?: string;
  payload?: { value: string };
}) {
  const stage = payload?.value ?? "";

  return (
    <Text
      x={x}
      y={y}
      width={104}
      maxLines={1}
      breakAll
      textAnchor="end"
      verticalAnchor="middle"
      className={className}
      fill="var(--muted-foreground)"
      aria-label={stage}
    >
      {stage}
    </Text>
  );
}

function StageBar(props: BarShapeProps) {
  // Keep zero-count rows in Recharts' label data without giving them a nonzero bar.
  return <Rectangle {...props} />;
}

export function PipelineFunnel({ data }: { data: PipelineFunnelDatum[] }) {
  const chartData = data.map((entry) => ({ ...entry, fill: entry.color || "var(--color-count)" }));
  const maxCount = data.reduce((maximum, entry) => Math.max(maximum, entry.count), 1);
  const hasDeals = data.some((entry) => entry.count > 0);

  return (
    <Card role="region" aria-label="Pipeline Overview" className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Pipeline Overview</h2>
        </CardTitle>
        <CardDescription>Deal count and value by pipeline stage.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="grid h-60 place-items-center rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">No pipeline stages yet.</p>
          </div>
        ) : (
          <>
            {!hasDeals && <p className="mb-4 text-muted-foreground text-sm">No deals in this pipeline yet.</p>}
            <ChartContainer
              config={chartConfig}
              className="aspect-auto w-full"
              style={{ height: Math.max(240, data.length * 44 + 48) }}
            >
              <BarChart
                accessibilityLayer
                aria-label="Deal count by pipeline stage"
                data={chartData}
                layout="vertical"
                margin={{
                  left: 0,
                  right: Math.max(36, countFormatter.format(maxCount).length * 7 + 16),
                  top: 8,
                  bottom: 8,
                }}
                barSize={24}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, maxCount]}
                  allowDecimals={false}
                  tickCount={4}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value: number) => axisFormatter.format(value)}
                />
                <YAxis
                  dataKey="stage"
                  type="category"
                  width={112}
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={<StageTick />}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
                  content={
                    <ChartTooltipContent
                      className="max-w-[min(20rem,calc(100vw-2rem))]"
                      labelFormatter={(_label, payload) =>
                        `Stage: ${(payload[0].payload as PipelineFunnelDatum).stage}`
                      }
                      formatter={(_value, _name, item) => {
                        const entry = item.payload as PipelineFunnelDatum;

                        return (
                          <dl className="grid gap-1">
                            <div className="flex gap-2">
                              <dt className="text-muted-foreground">Deals:</dt>
                              <dd className="font-medium tabular-nums">{countFormatter.format(entry.count)}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-muted-foreground">Value:</dt>
                              <dd className="wrap-anywhere font-medium tabular-nums">{formatStageValue(entry)}</dd>
                            </div>
                          </dl>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="count" name="Deals" fill="var(--color-count)" radius={[0, 6, 6, 0]} shape={StageBar}>
                  <LabelList
                    dataKey="count"
                    position="right"
                    offset={8}
                    className="fill-foreground"
                    formatter={(value) => countFormatter.format(Number(value))}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="sr-only">
              <table>
                <caption>Pipeline stage totals</caption>
                <thead>
                  <tr>
                    <th scope="col">Stage</th>
                    <th scope="col">Deals</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((entry) => (
                    <tr key={entry.id ?? entry.stage}>
                      <th scope="row">{entry.stage}</th>
                      <td>{countFormatter.format(entry.count)}</td>
                      <td>{formatStageValue(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
