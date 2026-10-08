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

### Telephony: click-to-call (16.1)

For an existing database, apply [`prisma/sql/16-1-phone-calls.sql`](./prisma/sql/16-1-phone-calls.sql) after the workspace, audit and notification migrations and regenerate Prisma Client. A fresh database can use `npx prisma db push`. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (a voice-capable Twilio number), `TWILIO_AGENT_PHONE_NUMBER` (the operator phone) and `TWILIO_WEBHOOK_BASE_URL` (the public HTTPS origin, without a path). The webhook origin falls back to `NEXTAUTH_URL` when not set. Local development needs a public HTTPS tunnel.

The Call button beside a contact's phone requires EDIT access and asks for confirmation. Twilio rings the configured operator first; once answered, the signed voice webhook connects to the contact's saved international-format number. The operator number is deployment-wide, so this implementation uses one configured operator phone, not each user's personal phone. Both legs use the configured Twilio caller ID. Recording starts when the contact answers. The confirmation explicitly mentions recording. PhoneCall is saved and audited before dialing; callbacks update status and duration, and recording callbacks save audio when ready. Missed/busy/canceled calls notify the initiating user once. Operator failure to answer does not dial the contact. Recording playback uses an authenticated proxy, keeping Twilio credentials on the server.

Contact history now has Timeline and Calls tabs, with paginated call logs, playback and editable notes. Workspace and record permissions apply to list, detail, edit and recording routes. Webhooks require a valid Twilio signature. Inbound call routing, voicemail detection and transcription are not part of 16.1. Trial accounts may require verified destination numbers. Verify the operator/contact bridge, callbacks and recording playback with your configured Twilio account before deployment.

### Unified Inbox: WhatsApp and Telegram (17.1)

Apply [`prisma/sql/17-1-messaging.sql`](./prisma/sql/17-1-messaging.sql) once after workspace, ACL and notifications, then regenerate Prisma Client. Fresh databases can use `prisma db push`. Set `MESSAGING_WEBHOOK_BASE_URL` to the public HTTPS origin and `MESSAGING_TOKEN_ENCRYPTION_KEY` to a stable, separate 32-byte base64 key. Set `WHATSAPP_APP_SECRET` and `WHATSAPP_API_VERSION` for Meta. OWNER/ADMIN connects channels in **Settings → Messaging**; tokens and webhook secrets are encrypted and excluded from API responses. Telegram bot identity is hashed from the verified bot ID so token rotation cannot connect the same bot to another workspace.

Copy each channel's webhook URL, including its `channelId` query parameter. In Meta, configure that URL and the channel's Verify Token and subscribe to `messages`. Telegram connection registers its webhook automatically with a secret header. Incoming messages are deduplicated by channel/conversation/provider ID. WhatsApp links contacts by normalized phone within the channel workspace. Telegram links only a verified self-shared phone, or a string `customFields.telegramUserId` / `customFields.telegramChatId` on a contact; names and usernames are not treated as verified identity. Unknown senders remain unlinked. Telegram supports private bot chats; group messages and edited updates are ignored.

Inbox provides platform/status/assignee/search filters, cursor-paginated chat history, read counts, assignment and status changes, text and public HTTPS image replies. WhatsApp replies require the 24-hour service window or an approved template (name, language and one body parameter per line). Incoming WhatsApp delivery callbacks update sent/delivered/read/failed status without regression. Media downloads use an authenticated proxy and never expose Telegram bot-token URLs. Unlinked conversations are visible to workspace members for triage; linked conversations follow Contact ACL. VIEWER cannot send or edit. New messages notify the assignee/contact owner if authorized, or workspace admins. Pausing retains history but acknowledges/discards new incoming events; there is no history backfill or automatic retry of ambiguous outbound delivery. Providers and credentials must be tested with real accounts before deployment.

The responsive two-panel layout is adapted from the existing [Base UI chat example](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui/tree/main/src/app/(main)/chat/_components) using the repository's Bubble, Message and MessageScroller components. Messaging uses polling; no extra worker or realtime server is required.

### Lead capture forms (18.1)

Apply `prisma/sql/18-1-lead-capture-forms.sql` once to an existing database, then run `npx prisma generate`. Owners, administrators and managers can create/edit forms at `/dashboard/forms`; `/forms/{slug}` and `POST /api/forms/{slug}/submit` are public. The API folder uses `[id]/submit` to avoid Next.js's conflicting dynamic segment names. Serve the CRM over HTTPS for website iframe embeds and clipboard support; deployment headers must permit framing public `/forms/*` pages.

Configure fields with CRM keys `firstName`, `lastName`, `email`, `phone`, `message`; custom keys are preserved in submissions and new contacts' custom fields. Missing names default to Website/Lead. Email matching is case-insensitive within the form's workspace. Existing contact data and ownership are preserved; tags/deals are applied only if the configured lead owner can edit the matched contact. The configured owner, then form creator, then workspace administrator receives the notification. No contact identifiers are returned publicly.

Submissions are atomic and replay-safe (`requestId`: UUID). They use a honeypot, 64 KiB JSON limit and a database-backed limit of 60 submissions/form/minute. Enable `FORMS_TRUST_PROXY=true` **only** if a trusted proxy replaces forwarding headers, adding a limit of 5 submissions/IP/form/minute. For public production traffic add proxy/WAF abuse protection or CAPTCHA; these safeguards are not a complete anti-bot service. Submission metadata may contain IP/referrer/user agent: configure an appropriate retention/privacy policy. Deleting a form removes its submissions but preserves contacts and deals. New models are not applied to a live database automatically.

### Workflow engine (19.1)

Apply `prisma/sql/19-1-workflows.sql` once and run `npx prisma generate`. Start a **separate persistent process**, `npm run worker:workflows`, with `DATABASE_URL`, `REDIS_URL` and email provider/encryption settings when sending emails. Do not run workers inside Vercel route handlers. The worker uses the dedicated `workflow-execute` queue; email sync stays on `email-sync`.

`/api/workflows` supports paginated GET and POST; `/api/workflows/{id}` supports GET, PATCH and soft DELETE (history is preserved). Owners/admins manage workspace workflows; managers manage only their own, so editing another creator's automation cannot escalate permissions. PATCH includes the current ISO `updatedAt`. `/api/workflows/{id}/runs` provides paginated history and POST for active MANUAL workflows with `{entityType, entityId, requestId}` (UUID). History redacts inaccessible record identifiers/logs. This task is backend-only; a visual workflow editor is not included.

Events are recorded atomically with contact creation/update, deal creation/stage changes (including Closed Won/Lost), activity completion, form submission/new leads/deals, inbound email sync and first email open. Workflow actions intentionally do not recursively trigger other workflows, preventing automation loops. Email triggers use entityType `EmailMessage`; sending requires an accessible linked contact. Scheduled workflows require `triggerConfig: {entityType, entityId, intervalMinutes}`; intervals are anchored to workflow creation, evaluated every 15 seconds, and do not backfill missed intervals after downtime.

Supported steps: CONDITION, SEND_EMAIL, CREATE_TASK, UPDATE_FIELD (explicit safe fields), ASSIGN_OWNER, ADD_TAG, MOVE_STAGE, SEND_NOTIFICATION, CALL_WEBHOOK, WAIT. `SEND_WHATSAPP` and `ENROLL_SEQUENCE` are reserved enum values and rejected by validation until their automation adapters exist. Each step is `{type, config}`; array order determines its position. A false CONDITION cancels remaining steps. WAIT uses `config.duration` in **seconds** (1–2,592,000); CREATE_TASK accepts `title`, optional `description`/`userId`, and `dueInMinutes` (default 1440). SEND_EMAIL requires the creator's `accountId`, `subject`, `bodyHtml`, optional `trackingEnabled`. Notifications accept `title`, optional `body`/`userId`; ASSIGN_OWNER uses `userId`, ADD_TAG `tagId`, MOVE_STAGE `stageId`, UPDATE_FIELD `{field, value}`, CALL_WEBHOOK `{url}`. Templates use flat `{{firstName}}`, `{{email}}`, `{{title}}`, etc. from event snapshots; HTML substitutions are escaped, unknown variables fail closed. Trigger/CONDITION operators: equals, not_equals, contains, gt, lt; missing/invalid fields never match.

Runs persist immutable step/context snapshots, checkpoints, leases and event deduplication in PostgreSQL. The worker dispatcher recovers pending runs after Redis downtime; WAIT creates a delayed BullMQ continuation. Database actions and checkpoints are transactional. An external email/webhook started before a crash has an **uncertain outcome**, so the run fails instead of blindly resending: inspect the provider before starting a new manual run. Webhooks send an Idempotency-Key; receivers should honor it. Workflow deactivation/deletion takes effect at the next step (already-started external requests cannot be recalled). Creator membership, workspace-scoped record permissions and action references are rechecked while executing, independent of the creator's currently selected workspace.

CALL_WEBHOOK requires HTTPS port 443 and an exact hostname in `WORKFLOW_WEBHOOK_ALLOWED_HOSTS`. DNS answers are checked against private/reserved IP ranges and pinned for the request; redirects are not followed, requests time out after 10 seconds and responses/payloads are bounded. Keep the host allowlist administrator-controlled and add network-level egress rules in production. Workflow snapshots may contain contact data: restrict DB access and define a retention policy. The SQL migration is not applied automatically.

Example POST `/api/workflows`:

```json
{
  "name": "Follow up on website leads",
  "trigger": "CONTACT_CREATED",
  "triggerConfig": {"entityType": "Contact", "conditions": [{"field": "source", "operator": "equals", "value": "WEBSITE"}]},
  "steps": [
    {"type": "CREATE_TASK", "config": {"title": "Follow up with {{firstName}}", "dueInMinutes": 60}},
    {"type": "WAIT", "config": {"duration": 3600}},
    {"type": "SEND_NOTIFICATION", "config": {"title": "Lead follow-up due", "body": "Check {{firstName}} {{lastName}}"}}
  ]
}
```

### Outgoing webhooks (20.1)

Apply `prisma/sql/20-1-webhooks.sql` before deploying the updated CRM routes, then run `npx prisma generate`. Configure a stable `WEBHOOK_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) and launch `npm run worker:webhooks` in a persistent process with `DATABASE_URL` and `REDIS_URL`. The independent `webhook-deliver` queue must not share an email-sync processor. Apply pending 19.1/19.2 SQL scripts in order before deploying the whole checkout.

Owners/admins manage endpoints at `/dashboard/settings/webhooks` and `/api/webhooks-config` (GET/POST); `/{id}` supports GET/PATCH/DELETE, `/{id}/deliveries` paginated history (or a scoped `deliveryId` filter), and `/{id}/test` POST with a UUID `requestId`. PATCH requires current `updatedAt`. Creation generates a signing secret if omitted; creation/rotation returns the plaintext **once**, and ordinary GET/history responses never expose secrets/custom header values. Secrets and custom headers are AES-256-GCM encrypted in the database. Rotate with `{rotateSecret: true, updatedAt}`; a supplied `{secret}` also replaces it. Headers omitted from PATCH stay unchanged, `{headers: {}}` clears them. Deleted endpoints are soft-deleted; future deliveries stop, history remains stored. Requests already in flight cannot be recalled. Paused endpoints permit explicit test sends only.

CRM mutations and pending deliveries commit in one PostgreSQL transaction. The worker polls persisted work every 15 seconds and uses BullMQ delayed jobs for **three retries after the first send**: 1 minute, 5 minutes, 30 minutes (four HTTP attempts maximum). Network failures and every non-2xx status, including redirects/429/5xx, are retried; redirects are never followed. `failCount` counts consecutive failed attempts, resetting on success. Interrupted attempts consume their attempt slot and are rescheduled with backoff. Endpoints URL/headers/secret/payload are snapshotted per delivery, so queued retries remain consistent through edits or key rotation. Keep the previous signing secret accepted by the receiver until queued deliveries finish. Preserve the encryption key; changing it makes existing encrypted configuration unreadable.

Payload envelope: `{id, event, createdAt, workspaceId, data}`. `X-Webhook-Signature` is `sha256=<hex HMAC-SHA256>` over the **exact raw UTF-8 request body** with the displayed signing secret. Verify with constant-time comparison before parsing/processing. `X-Webhook-Delivery-Id` and `Idempotency-Key` identify one delivery across attempts; receivers must deduplicate because outbound HTTP is at-least-once (a timeout/crash can occur after a receiver processed the request). The exact payload text is stored separately from JSONB to keep HMAC bytes stable. Payloads are bounded to 256 KiB; response reading to 64 KiB, stored body to 2,000 characters; known credential values are redacted from responses. History may contain contact data: restrict access and define a retention policy.

Supported subscriptions: contact.created/updated/deleted (deleted means CRM archival), deal.created/stage_changed/won/lost, activity.completed, form.submitted, email.received/opened. Won/lost use Closed Won/Closed Lost stages. First email open only emits once. Inbound email events omit large HTML/text bodies. Test calls enqueue a `webhook.test` payload and return 202; the settings UI polls the real delivery result instead of pretending a queued job succeeded. If the result stays PENDING, verify the worker is running.

Only public HTTPS endpoints on port 443 are permitted. Credentials/fragments and localhost/private/reserved addresses are blocked; all DNS answers are validated and one address is pinned for TLS, with a 10-second total DNS/request deadline. Set `WEBHOOK_ALLOWED_HOSTS` to a comma-separated exact-host allowlist to restrict destinations further. HTTP header overrides cannot alter signing, Host, content length or connection control. Keep allowlist/encryption settings administrator-controlled; use network-level egress rules in production. No migration or live external delivery runs automatically during development checks.

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
npm run test:telephony
npm run test:integrations
```

The telephony suite uses Node.js 24+, mocked Prisma delegates and simulated signed Twilio callbacks. It makes no real calls and covers bridge setup, authorization, workspace isolation, callback retries, terminal status preservation, recording correlation and atomic missed-call notifications.

The integration command runs telephony, messaging, forms, workflows and outgoing webhook suites, including authorization, transaction rollback, signatures, delivery leases, deduplication and all four delivery attempts. It does not send real messages or connect provider accounts.

`npm run preview:webhooks` serves the actual webhook settings component and project styles at `http://127.0.0.1:3107`, using clearly labelled in-memory fixtures. It never connects to CRM authentication, Prisma, Redis or real webhook endpoints; preview edits disappear on reload.

### Visual workflows (19.2)

The `/dashboard/workflows` list supports creation, active toggles and usage metadata. New workflows start paused. The React Flow editor supports dragging/clicking palette steps, inline node configuration, Yes/No branches, positions/viewport persistence, keyboard/touch connections, deletion, validation, conflict detection, reload/discard protection and paginated run history. Existing linear workflows are converted on the first save; false conditions end that branch without executing later actions.

Apply `prisma/sql/19-1-workflows.sql` and then `prisma/sql/19-2-workflow-canvas.sql` before using the UI. `npm run worker:workflows` must run separately in a persistent Node process with PostgreSQL/Redis access; Vercel Functions do not host this long-running BullMQ worker. Workflow UI needs no new environment variables. `WORKFLOW_WEBHOOK_ALLOWED_HOSTS` permits exact public HTTPS hosts for the Call Webhook action; empty disables that action. Email actions require the creator’s connected email account and email configuration.

`npm run preview:workflows` serves the actual list/editor/run log at `http://127.0.0.1:3108` using labelled, in-memory fixtures with no provider deliveries or database access.

### Products / SKU catalog (21.1)

`/dashboard/products` provides search by name/SKU, category/status filters, server-side sorting and pagination, active toggles and create/edit sheets. All workspace members can read; Viewer cannot change products. Every write and its audit record commit atomically. API monetary values are decimal strings, not floating-point calculations. PATCH requires the current `updatedAt` value to reject stale changes. SKU is trimmed/uppercased and unique within a workspace; blank SKU becomes null. DELETE archives the row and reserves its SKU, preserving future document references.

Before deploying to an existing database, apply `prisma/sql/21-1-products.sql` through a trusted direct PostgreSQL connection. The migration is additive and is not run by tests/builds. No new environment variables are required. LineItem and document relations are supplied by task 21.2 below.

`npm run test:integrations` also covers products validation, tenant isolation, roles, duplicate SKU, optimistic concurrency, archival and audit rollback. `npm run preview:products` serves the actual catalog/form components at `http://127.0.0.1:3109` with labelled in-memory fixtures, including a Viewer-role preview. It never connects to the database; changes disappear on reload.

### Quotations (21.2)

Apply `prisma/sql/21-2-quotations.sql` after the products migration before deploying this feature. It creates Quotation, LineItem, Invoice and per-workspace/year document counters. No production migration is executed by checks. Numbers are unique **within a workspace**, not globally: QUO/INV/CTR each has its own atomic counter. Quotation numbers use the issue-date year; conversion uses the current invoice year. Reserving a number, storing a document/items and writing its audit record share one transaction.

`/dashboard/quotations` supports client/product searches, draft editing, stored paper previews, actual PDF generation/download, sending a PDF attachment through the user's connected Gmail/Outlook account, manual acceptance/decline, and one-time conversion to a draft invoice. Company quotations require a linked contact for email delivery; the recipient must belong to that company. Converted invoice snapshots are visible at `/dashboard/invoices/[id]`; their editing, sending and payment management are supplied by 21.3 below. VIEWED is reserved; email opens do not imply client acceptance or automatically mark quotation status.

### Invoices + payments (21.3)

Apply `prisma/sql/21-3-invoices-payments.sql` after 21.1 and 21.2 before deploying to an existing database. Checks/builds do not apply production migrations. No new environment variables are needed: PDF/email reuse the existing Gmail/Outlook configuration; outgoing paid webhooks use the existing persistent `npm run worker:webhooks` process and Redis configuration from 20.1.

`/dashboard/invoices` supports standalone creation, conversion from quotations, draft editing, line-item/client snapshots, PDF preview/download, email sending, overdue filters and paginated payment history. Invoice numbers use the issue-date year and the shared per-workspace invoice counter. Payments are **manual records of money already received**, not Stripe/PayPal integrations or card charges. A receipt records amount, method, date, reference and notes in the invoice currency. No exchange-rate conversion or overpayment is accepted.

POST `/api/invoices/[id]/payments` requires `requestId` (UUID) and the current invoice `updatedAt`, in addition to `amount` and `method`. Keep the same request ID/body after a network failure; replay returns the saved receipt without another payment/notification/webhook. A reused ID with different content is rejected. Nonblank references must be unique per invoice/payment method. Row locking, receipt creation, Decimal amountPaid/status updates, two audit entries, notification and the full-payment webhook delivery ledger commit in one transaction. Concurrent stale requests must reload. Partial receipts set PARTIALLY_PAID; reaching the exact total sets PAID and enqueues `invoice.paid` once per invoice/endpoint. Existing webhook transport is at-least-once; receivers deduplicate delivery IDs. Paid event data excludes client contact details.

Members manage their own accessible invoices; admins manage accessible workspace invoices; Viewers are read-only. Notification goes to the owner only while their membership/linked-record view rights remain, otherwise to the recording user. Payment DTOs omit workspace/recorder/deduplication metadata. Only unpaid, unsent drafts without payment history can be edited/archived; archival reserves the number and does not reverse quotation conversion. Unpaid invoices may be cancelled. Pending/failed/refunded payment states and VIEWED/REFUNDED invoice states are reserved for future provider/refund flows, not manually assignable through these endpoints.

Email attaches an actual embedded-font PDF with paid/balance totals. The send claim prevents concurrent payments from regressing status; already recorded partial/full payments remain partial/paid after sending. Uncertain delivery blocks automatic resend/edit; check the connected account's Sent folder. Recording an independently verified receipt remains possible for an uncertain email. No public payment link or automatic fund movement is introduced.

`npm run test:integrations` covers invoice/payment validation, tenant/record isolation, concurrency, replay, rollback, email attachments and real PDF generation without database/provider IO. `npm run preview:invoices` serves actual components at `http://127.0.0.1:3111` with labelled memory-only fixtures (no live email, database or financial transactions).

All requests enforce workspace and related-record permissions. Members manage their own documents; workspace admins can manage all accessible documents. Viewers have read-only access to documents whose linked records they can view. No live current-contact or issuer lookup is used to alter an already-issued paper snapshot. Product links are validated, but document prices/descriptions/tax are independent snapshots; currency mixing and automatic FX conversion are refused.

Amounts use decimal arithmetic: each line's quantity × price rounds half-up to two decimals, percentage discount rounds separately, and tax applies to the discounted amount, again rounded per line. Totals sum those rounded values. API inputs/outputs use decimal strings; totals are always server-calculated. Client preview uses the same algorithm. Up to 100 lines and 128 KiB input are allowed. New POST requires a UUID `requestId` for replay protection; PATCH/send/convert/DELETE require current `updatedAt`. Only unsent drafts can be edited or archived. Sent and converted documents remain immutable. Expired draft/sent/viewed quotations are displayed and filtered as EXPIRED without rewriting records on a read.

The send transaction claims a quotation before calling the provider. A timeout or failure after that claim marks delivery UNCERTAIN and blocks automatic retry/edit/conversion; a process crash may leave SENDING. Inspect provider Sent and EmailMessage/audit records before administrator reconciliation. This deliberately avoids promising exactly-once delivery from Gmail/Graph. Conversion is transactional and idempotent, copies stored amounts/items, creates only one draft invoice and never records a payment or sends it.

PDFs embed the bundled OFL Noto Sans font (including Cyrillic) and paginate long descriptions/terms. Font tracing is configured for Vercel; PDFs and previews are authenticated/private, with no public client URL. No new environment variables are needed beyond existing database/email configuration. `npm run preview:quotations` serves real components and real PDF rendering at `http://127.0.0.1:3110` with labelled disposable fixtures and no live provider/database requests.

## Contracts (21.4)

Apply `prisma/sql/21-4-contracts.sql` after 21.2 before using `/dashboard/contracts`. No production migration is run by a check/build; no new environment variables are required. Contract numbers (`CTR-YYYY-NNNN`) are unique per workspace/year, matching the existing transactional document counter. Create requires a stable UUID `requestId`; edit/status/signatures/delete require current `updatedAt`. Related contact/company/deal must be accessible and belong to the same workspace and client.

Draft and Pending Review content can be edited in a Markdown textarea with heading/bold/list toolbar and escaped preview. Mark Sent is a **manual status only**, not email delivery. Sent contracts are immutable. Signature switches are manual CRM records, not verified electronic signatures. Both marks automatically set Signed; removing a mark before activation returns to Sent. Activation requires both marks and a current date period; Signed/Active contracts can be marked Expired only after their end date. Expiry is explicit (no scheduler added). Cancelled and Expired are terminal. Only drafts may be soft-deleted; numbers stay reserved. Document links must be HTTPS, never fetched by the server. HTML/scripts in contract content are displayed as text.

API applies the existing document owner/admin and linked-record access policy; Viewers are read-only. Mutations use optimistic concurrency and transactional audit logs; content body is not duplicated into audit logs. `npm run test:integrations` includes contracts API/lifecycle coverage. `npm run preview:contracts` serves real UI components with labelled disposable memory fixtures at `http://127.0.0.1:3112`.

## Built with

The UI foundation comes from [next-shadcn-admin-dashboard-baseui](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui). Product patterns and design ideas were also informed by [Comp AI CRM](https://github.com/trycompai/crm), [Frappe CRM](https://github.com/frappe/crm), [Twenty](https://github.com/twentyhq/twenty), and [RuoYi-Vue-Pro](https://github.com/YunaiV/ruoyi-vue-pro).
