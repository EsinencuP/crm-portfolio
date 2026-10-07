# CRM Portfolio

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Base%20UI-000000)

A CRM dashboard for contacts, companies, deals, activities, analytics, and team management. Built with Next.js App Router and a PostgreSQL database.

**Live demo:** [crm-portfolio-omega.vercel.app](https://crm-portfolio-omega.vercel.app) · Sign in with the [demo credentials](#demo-credentials).

![CRM dashboard screenshot placeholder](./public/screenshots/dashboard.png)

> Screenshot placeholder: add a capture at `public/screenshots/dashboard.png` when the final demo UI is ready.

## Features

- 👥 **Contacts and companies** — searchable records, details, notes, related deals, and activities.
- 💼 **Deal pipeline** — Kanban drag and drop, table view, stage configuration, and weighted forecasts.
- 📅 **Activities** — calendar and task list for calls, emails, meetings, and follow-ups.
- 📊 **Dashboards and analytics** — KPI cards, pipeline and revenue charts, and sales reports.
- 🔐 **Authentication and roles** — credentials, optional Google OAuth, team invitations, and role-based access.
- ✨ **AI assistance** — contact briefs, deal scores, and email drafts when `OPENAI_API_KEY` is configured.
- 🎨 **Responsive UI** — Base UI components, theme presets, light and dark modes.

## Tech stack

| Layer | Tools |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui on Base UI, Lucide React, sonner |
| Data | PostgreSQL, Prisma ORM, TanStack Query, TanStack Table |
| Auth | Auth.js / NextAuth v5, bcryptjs |
| Forms | React Hook Form, Zod |
| Charts and planning | Recharts, FullCalendar, @dnd-kit/react |
| AI | Vercel AI SDK, OpenAI |
| Client state and tooling | Zustand, Biome |

## Getting started

Prerequisites: Node.js, npm, and a PostgreSQL database.

```bash
git clone https://github.com/EsinencuP/crm-portfolio.git
cd crm-portfolio
npm install
cp .env.example .env
```

Set `DATABASE_URL` and a fresh `AUTH_SECRET` in `.env`. Generate the secret with `npx auth secret` or another cryptographically secure generator. The optional Google and OpenAI variables are described in [`.env.example`](./.env.example).

```bash
npx prisma db push
npx prisma db seed
npm run dev
```

Open `http://localhost:3000`. The seed is repeatable and adds demo records without deleting other CRM data. Use it only with a database intended for demo data.

### Upgrading an existing database to multi-workspace

Back up the database and stop application writes. Apply [`prisma/sql/13-1-multi-workspace.sql`](./prisma/sql/13-1-multi-workspace.sql) **once**, using a direct PostgreSQL connection. It creates the workspace tables, assigns all existing CRM records and invitations to `Original Workspace`, and makes one existing user the owner. Do this before deploying code that requires `workspaceId`. For example, with `DATABASE_URL` set to the direct connection:

```bash
npx prisma db execute --file prisma/sql/13-1-multi-workspace.sql --schema prisma/schema.prisma
npx prisma generate
```

Do not run `prisma db push` against the old schema before the backfill: existing rows cannot satisfy a new required `workspaceId`. A new empty database can use `prisma db push` followed by `prisma db seed`. On a new database, add a partial unique index to guarantee one active workspace per user:

```sql
CREATE UNIQUE INDEX "WorkspaceMember_one_default_per_user" ON "WorkspaceMember"("userId") WHERE "isDefault" = true;
```

The active workspace is stored on `WorkspaceMember.isDefault`. Workspace deletion permanently removes its CRM data and invitations and requires an owner; take a backup before deleting a populated workspace.

### Adding the audit log to an existing database

After the multi-workspace backfill, apply [`prisma/sql/13-2-audit-log.sql`](./prisma/sql/13-2-audit-log.sql) once using a direct PostgreSQL connection, then run `npx prisma generate` before deploying the audit-log application code. On a fresh database, `npx prisma db push` creates the audit table with the other tables. CRM writes made through the shared Prisma client are audited automatically; direct SQL and maintenance scripts using a separate client are not intercepted. Existing historical edits cannot be reconstructed retroactively.

### Enabling record-level sharing

After the workspace and audit migrations, apply [`prisma/sql/13-3-record-permissions.sql`](./prisma/sql/13-3-record-permissions.sql) once using a direct PostgreSQL connection, then run `npx prisma generate`. A fresh database can use `prisma db push`. OWNER and ADMIN can access every record in their workspace. MANAGER and MEMBER can access only records they own or have been granted; VIEWER can read workspace records but cannot edit or share them. A `NONE` grant hides a record from a VIEWER. Company records have no `ownerId`; a newly created company gives its creator a FULL grant, and the demo seed assigns explicit company grants. Existing non-demo companies need to be shared by an OWNER/ADMIN after migration. Revoking workspace membership removes that user's grants. Apply this migration before deploying ACL code, and plan a sharing/backfill pass for existing data before expecting managers and members to see all their former workspace records.

### Enabling notifications

After the workspace, audit, and ACL migrations, apply [`prisma/sql/14-1-notifications.sql`](./prisma/sql/14-1-notifications.sql) once using a direct PostgreSQL connection, then run `npx prisma generate`. Fresh databases can use `prisma db push`. The bell polls the unread count every 30 seconds. Deal stage changes (including won/lost) and task assignments create notifications for the affected owner. Removing workspace membership clears that user's workspace notifications. Other notification types are available through the server-side helper, but incoming email, form submissions, due-task scheduling, and workflow completion have no producer in this repository yet. Notification creation from CRM routes is best effort: a delivery failure is logged without rolling back a successful CRM change.

### Email accounts and inbox (15.1–15.2)

After the earlier SQL migrations, apply [`prisma/sql/15-email-accounts-and-messages.sql`](./prisma/sql/15-email-accounts-and-messages.sql) once and run `npx prisma generate`. For a fresh database, apply the whole schema with `npx prisma db push` instead. Set `EMAIL_OAUTH_BASE_URL` to the public application origin, register `/api/email-accounts/callback/gmail` and `/api/email-accounts/callback/outlook` at the respective providers, and configure the corresponding client IDs/secrets. Generate `EMAIL_TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded in base64 and keep it stable; rotating it without re-encrypting stored tokens requires users to reconnect.

Set `REDIS_URL` and run `npm run worker:email` as a **separate persistent process**. BullMQ schedules sync every five minutes; the worker also performs a startup pass. The Next.js/Vercel web process does not run this worker automatically. Initial Gmail sync imports up to 1,000 messages from the last 30 days; subsequent runs use Gmail history IDs. Outlook sync uses Graph delta cursors for Inbox and Sent Items. Connected accounts and message bodies are restricted to their connecting user within the active workspace. Disconnecting removes locally synced messages and stored tokens, but does not revoke consent at Google/Microsoft. Gmail restricted scopes may require provider verification before public use. OAuth and worker behavior require real provider accounts and Redis and have not been end-to-end tested here.

### Sending and tracking (15.3)

After the notifications migration, apply [`prisma/sql/15-3-email-clicked-notification.sql`](./prisma/sql/15-3-email-clicked-notification.sql) and regenerate Prisma Client. Sending from the Mail compose dialog and contact AI draft now uses `/api/emails/send` with the connected account. Tracking is opt-in per message. Set `EMAIL_TRACKING_BASE_URL` to a publicly reachable HTTPS origin and `EMAIL_TRACKING_SECRET` to a separate random secret of at least 32 characters. The open pixel and signed click links must remain reachable without login. First open and first click create notifications; repeated requests increase counters without more notifications. Open counts are approximate because email clients can block, proxy, or prefetch images. Changing the tracking secret invalidates links in previously sent emails. The public tracking routes have not been exercised with real mail providers in this workspace.

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@demo.com` | `admin123` |
| Manager | `manager@demo.com` | `manager123` |
| Member | `member@demo.com` | `member123` |

These credentials are deliberately simple for a local demo. Do not seed a database that contains real customer data or expose these accounts in a production workspace. For a non-demo database, register a user and run `npm run bootstrap:admin -- user@example.com` from a trusted shell to grant the first admin role.

## Architecture

```text
Browser (React, Base UI, TanStack Query)
  ├─ Next.js App Router pages and server components
  ├─ Route handlers: /api/contacts, /api/deals, /api/activities, /api/users, ...
  ├─ Auth.js credentials / Google OAuth, session and role checks
  └─ Prisma Client ── PostgreSQL
                 └─ OpenAI API (optional AI routes)
```

The Prisma schema is in `prisma/schema.prisma`. API route handlers live in `src/app/api`; dashboard pages are under `src/app/(dashboard)/dashboard`. The seed is in `prisma/seed.ts`.

## Deploying to Vercel

1. Create a dedicated hosted PostgreSQL database reachable from Vercel. For an existing database, follow the multi-workspace backfill above before deploying. For a fresh database, apply the schema with `npx prisma db push` and add the partial unique index shown above. Use a direct connection for schema changes; keep the pooled URL in `DATABASE_URL` for the running app.
2. Link or import this GitHub repository in Vercel. Set `DATABASE_URL` and a new `AUTH_SECRET` for the deployment. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OPENAI_API_KEY` only if those features are enabled. Configure the Google OAuth callback URL for the deployed domain.
3. Deploy with `vercel deploy --prod` or through the connected Git repository. [`vercel.json`](./vercel.json) generates Prisma Client during the build. [`.vercelignore`](./.vercelignore) excludes local environment files from CLI uploads.
4. Verify `/login`, an authenticated `/dashboard`, and a database-backed page on the deployed URL. Seed the hosted database only if the deployment is explicitly a disposable demo.

Team invitation links are created in **Settings → Team & roles** and must be shared manually; the app does not send invitation emails.

## Checks

```bash
npm run typecheck
npm run check
npm run build
```

## Built with

The UI foundation comes from [next-shadcn-admin-dashboard-baseui](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui). Product patterns and design ideas were also informed by [Comp AI CRM](https://github.com/trycompai/crm), [Frappe CRM](https://github.com/frappe/crm), [Twenty](https://github.com/twentyhq/twenty), and [RuoYi-Vue-Pro](https://github.com/YunaiV/ruoyi-vue-pro).
