import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type CompanyContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  avatarUrl: string | null;
};

export function CompanyContactsTab({ contacts }: { contacts: CompanyContact[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts ({contacts.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {contacts.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/contacts/${encodeURIComponent(contact.id)}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <Avatar size="sm">
                          {contact.avatarUrl && <AvatarImage src={contact.avatarUrl} alt="" />}
                          <AvatarFallback>{`${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`}</AvatarFallback>
                        </Avatar>
                        {contact.firstName} {contact.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>{contact.jobTitle || "—"}</TableCell>
                    <TableCell>{contact.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{contact.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No contacts linked to this company.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
