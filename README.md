# CRM Portfolio

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Base%20UI-000000)

A CRM dashboard for contacts, companies, deals, activities, analytics, and team management. Built with Next.js App Router and a PostgreSQL database.

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

1. Create a dedicated hosted PostgreSQL database reachable from Vercel. Apply the schema to that database with `DATABASE_URL` set to its connection string: `npx prisma db push`.
2. Link or import this GitHub repository in Vercel. Set `DATABASE_URL` and a new `AUTH_SECRET` for the deployment. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OPENAI_API_KEY` only if those features are enabled. Configure the Google OAuth callback URL for the deployed domain.
3. Deploy with `vercel deploy --prod` or through the connected Git repository. [`vercel.json`](./vercel.json) generates Prisma Client during the build.
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
