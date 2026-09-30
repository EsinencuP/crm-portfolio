import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type CompanyDeal = {
  id: string;
  title: string;
  value: string | null;
  currency: string;
  closeDate: string | null;
  stage: { name: string; color: string };
};

export function CompanyDealsTab({ deals }: { deals: CompanyDeal[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deals ({deals.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {deals.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Close date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell>
                      {deal.value === null
                        ? "—"
                        : new Intl.NumberFormat("en-US", { style: "currency", currency: deal.currency }).format(
                            Number(deal.value),
                          )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" style={{ borderColor: deal.stage.color, color: deal.stage.color }}>
                        {deal.stage.name}
                      </Badge>
                    </TableCell>
                    <TableCell>{deal.closeDate ? format(new Date(deal.closeDate), "MMM d, yyyy") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No deals linked to this company.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
