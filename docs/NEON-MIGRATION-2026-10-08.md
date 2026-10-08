# Neon MVP migration — 8 October 2026

## Target and outcome

- Project: `nameless-meadow-11380888` (`crm-portfolio-db`).
- Database: `neondb`, PostgreSQL 18.
- Application branch: `main`, `br-little-recipe-b824kg3v`.
- Existing pooled/direct Vercel connection variables were preserved.
- The user approved migrations 13.1–21.4 before main was modified.
- All 16 repository SQL migrations committed successfully on both the test branch
  and main. No CRM rows or tables were deleted; no seed/reset was run.

## Safety procedure

Tested first on `mvp-migration-check-20261008` (`br-restless-salad-b84m2o7i`),
an isolated copy with one-day automatic expiry. Created
`backup-before-mvp-20261008` (`br-damp-cloud-b8o0kkgn`) from unmodified main
before updating main. The backup auto-expires after seven days (15 October 2026).
Do not delete it while rollback may be needed. Recovery must be an explicitly
reviewed operation; restoring the old schema after new application writes could
discard new records.

The reviewed files were applied in dependency order, in one transaction, with
10-second lock timeout and 120-second statement timeout. Per-file BEGIN/COMMIT
wrappers were replaced by the outer transaction; executable SQL was unchanged.

Main's transaction captured counts and deterministic checksums for all 14 legacy
tables in a temporary guard table. Before COMMIT it compared the old row contents,
excluding only the newly added `workspaceId`. A mismatch would raise an exception
and roll back the entire transaction. These guards passed. Before applying main,
its old-data checksums also matched the migrated test copy.

Preserved legacy counts:

| Table | Rows |
| --- | ---: |
| User | 3 |
| Contact | 50 |
| Company | 20 |
| Deal | 30 |
| Activity | 100 |
| Note | 80 |
| PipelineStage | 6 |
| Tag | 10 |
| _ContactToTag | 100 |
| _DealToTag | 30 |
| Account / AppSettings / Session / TeamInvite | 0 each |

13.1 assigned existing records to `legacy-workspace-default` (Original Workspace),
added existing-user memberships, and replaced four global unique indexes with
workspace-scoped indexes. The oldest prioritized administrator became OWNER;
the other users retained their corresponding workspace roles.

## Verification

Compared current `prisma/schema.prisma` against main's catalog: 37 models,
478 scalar columns, 162 enum values, plus enum-column type identities. No missing
columns/enum values, type/nullability mismatches, or Decimal precision differences
were returned. This is a compatibility check, not a promise of every future query
or integration behavior.

Verified actual authenticated Production pages at
`https://crm-portfolio-omega.vercel.app`: Dashboard, Contacts (50), Products,
Quotations, Invoices, Contracts, Forms, Workflows. Tables/data or valid empty states
loaded without the previous server-error screen. No real email was sent, no
mailbox consent was granted, and no financial payment or contract signature was
recorded during these checks.

The SQL scripts are not generally repeatable: **do not reapply 13.1–21.4** to main.
Inspect the actual catalog before subsequent migrations. Future schema updates
still require backup, branch testing, and application verification.

## Remaining infrastructure work

Upstash `REDIS_URL` and Google OAuth are configured, but persistent BullMQ worker
hosting has not been set up. Scheduled email sync, workflow execution, and queued
webhook delivery require the existing standalone workers to run on an always-on
host. See [MVP deployment checklist](MVP-DEPLOYMENT.md). This migration does not
claim those background integrations are operating.
