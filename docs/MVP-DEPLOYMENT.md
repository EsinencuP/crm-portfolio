# MVP deployment checklist

Target: `themrack26-1196s-projects/crm-portfolio`, Git branch `master`, public origin
`https://crm-portfolio-omega.vercel.app`. Credentials belong in Vercel/server
environment variables only, never in Git or `NEXT_PUBLIC_*` variables.

## Database

Main was upgraded on 8 October 2026; see [migration record](NEON-MIGRATION-2026-10-08.md).
Do not reapply the already committed 13.1–21.4 scripts to that branch.

The linked Neon project is `nameless-meadow-11380888` (`crm-portfolio-db`), database
`neondb`, main branch `br-little-recipe-b824kg3v`. Keep the existing database and
records. Runtime uses pooled `DATABASE_URL`; migration tools use the direct
`DATABASE_URL_UNPOOLED`. Do not run `prisma db push --accept-data-loss` or the seed
against this database.

Before upgrading an old database, inspect its actual schema, retain a backup
branch, and test the reviewed SQL on a child branch. Apply only missing migrations
from `prisma/sql` in numerical order: 13.1, 13.2, 13.3, 14.1, 15 email,
15.3 notification enum, 16.1, 17.1, 18.1, 19.1, 19.2, 20.1, 21.1, 21.2, 21.3,
21.4. These scripts are generally **not repeatable**. Verify tables, columns,
enum values, constraints and data preservation before release. A successful
Next.js build does not prove the database schema is current.

Migration 13.1 preserves existing records in `legacy-workspace-default`, adds
memberships, and replaces global email/domain/tag/invite uniqueness with
workspace-scoped uniqueness. It does not delete existing CRM records.

## Upstash queues

The existing `CRMtest` Upstash database supplies a native **TLS Redis URL**.
Set it as `REDIS_URL`; ioredis/BullMQ already support `rediss://` connections.
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not substitutes for
the connection used by BullMQ. No new Redis SDK is needed.

Upstash is queue storage, **not worker hosting**. The current workers are
long-running processes and must run on an always-on host, or temporarily on a
developer machine for a supervised demo:

```text
npm run worker:email
npm run worker:workflows
npm run worker:webhooks
```

Provide that host with the same database, Redis, stable encryption keys and
provider credentials as the web app. Never launch these workers during a Vercel
build or rely on detached background processes inside request handlers. Queue
polling consumes Upstash commands even while idle; monitor Free-plan usage and
run only the workers required for the demo. Moving to QStash/Upstash Workflow is
a separate architecture change, not a REDIS_URL rename.

## Google OAuth and Gmail

Google Cloud project: `flowing-banner-472123-j8`. App: `CRM Portfolio MVP`.
OAuth Web client: `CRM Portfolio MVP Web`. Gmail API must be enabled.

Production origin:

```text
https://crm-portfolio-omega.vercel.app
```

Authorized redirect URIs:

```text
https://crm-portfolio-omega.vercel.app/api/auth/callback/google
https://crm-portfolio-omega.vercel.app/api/email-accounts/callback/gmail
```

Store the Web client's ID/Secret in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
for sign-in and `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` for connecting Gmail.
Keep `EMAIL_OAUTH_BASE_URL` and `EMAIL_TRACKING_BASE_URL` at the production origin.
Email tokens require a stable 32-byte base64 `EMAIL_TOKEN_ENCRYPTION_KEY`;
tracking also requires a separate stable `EMAIL_TRACKING_SECRET`.

Declared scopes match the code: `openid`, `userinfo.email`, `userinfo.profile`,
`gmail.readonly`, `gmail.send`, `gmail.modify` (full Google scope URLs where
applicable). External/Testing allows only configured test users. Gmail refresh
tokens in Testing generally expire after seven days; reconnect the Gmail account
when required. Do not claim Google verification is complete or publish to
Production merely to remove that expiry. The user grants actual Gmail access
through CRM Settings → Email; creating a client does not authorize mailbox access.

For existing password accounts, Google may return `OAuthAccountNotLinked`;
do not enable dangerous automatic linking to work around it. Use the existing
password login to test that account, then connect Gmail in settings.

## Release acceptance

1. Confirm the intended commit and Production target.
2. Redeploy after environment changes; old deployments keep their old values.
3. Confirm Vercel `Ready`, then check real authenticated pages and APIs against
   the actual Neon database (contacts, products, quotations, invoices, contracts).
4. Run a supervised workflow/queue test only once worker hosting is configured.
5. The user completes OAuth consent; send no real emails or callbacks merely to
   test credentials without specifying and approving the destination.

References: [Upstash BullMQ](https://upstash.com/docs/redis/integrations/bullmq),
[Google OAuth token lifecycle](https://developers.google.com/identity/protocols/oauth2),
[Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
