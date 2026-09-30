# CRM Portfolio

Next.js 16 CRM with Prisma, PostgreSQL, Auth.js, Base UI, and Tailwind CSS v4.

## Local setup

1. Install dependencies: `npm install`.
2. Set `DATABASE_URL` and `AUTH_SECRET` in `.env`. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OPENAI_API_KEY` for the corresponding optional features.
3. Apply the Prisma schema: `npx prisma db push`.
4. Start the app: `npm run dev`.

## First admin

Register a normal account, then grant the first administrator role from a trusted local shell:

```bash
npm run bootstrap:admin -- user@example.com
```

The command only works while there is no admin. Later role changes happen in **Settings → Team & roles**. Public registration never grants admin access automatically.

## Team invitations

Admins can invite any role; managers can invite members and viewers. The **Invite user** dialog creates a single-use link valid for seven days. Copy and share it with the intended person. The app does not send invitation emails. Existing users must sign in with the invited email before accepting the role; new users create a password through the invitation link.

## Checks

Run `npm run typecheck`, `npm run check`, and `npm run build` before deploying.
