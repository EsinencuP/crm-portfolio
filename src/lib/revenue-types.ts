export const REVENUE_PERIODS = ["12m", "6m", "30d"] as const;
export type RevenuePeriod = (typeof REVENUE_PERIODS)[number];

export type RevenueMonth = {
  month: string;
  won: number;
  lost: number;
  closedDeals: number;
};

export type RevenueChartData = {
  period: RevenuePeriod;
  currency: string;
  currencies: string[];
  from: string;
  to: string;
  data: RevenueMonth[];
};
