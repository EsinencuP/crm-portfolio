import { requireAuth } from "@/lib/auth-utils";

import { KpiCards } from "./_components/kpi-cards";
import { PipelineFunnelWrapper } from "./_components/pipeline-funnel-wrapper";
import { RecentDeals } from "./_components/recent-deals";
import { RevenueChart } from "./_components/revenue-chart";
import { UpcomingActivities } from "./_components/upcoming-activities";

export default async function DashboardPage() {
  await requireAuth();

  return (
    <main className="flex min-w-0 flex-col gap-4 md:gap-6">
      <header className="space-y-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your CRM</p>
      </header>

      <KpiCards />

      <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <PipelineFunnelWrapper />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <UpcomingActivities />
        </div>
      </div>

      <RevenueChart />
      <RecentDeals />
    </main>
  );
}
