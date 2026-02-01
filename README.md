# CommitPulse

Track daily commit volume, LOC, and push cadence across all GitHub repos. Connect a Telegram bot to receive smart reminders only when it makes sense.

## Stack
- Turborepo + pnpm monorepo
- Next.js (App Router) client
- Convex backend + cron jobs
- Clerk auth (dev mode)
- Telegram notifications via Telegraf

## Local dev

```bash
pnpm install
pnpm run convex:dev
pnpm dev
```

## Environment

Copy `.env.example` to `.env` (or update `apps/web/.env.local`) and set:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`

## Convex

```bash
pnpm run convex:dev
```

To regenerate Convex types locally:

```bash
pnpm run convex:codegen
```

Then open the Convex dashboard to set env vars and deploy the cron jobs.

## GitHub

Generate a Fine-grained PAT with `repo` + `read:user` scopes. Paste it in the UI to sync commits.

## Telegram

Create a bot with BotFather, start it with `/start`, and paste:
- Bot token
- Chat ID (from bot updates)

Use **Save + test** to validate. Smart reminders run every 30 minutes via Convex cron.

## Security notes

- GitHub and Telegram tokens are stored server-side for sync/notifications. For production, use OAuth + a secrets vault or encrypted storage instead of plain tokens.
- Avoid sharing `.env` files or PATs; rotate tokens if they ever leak.
