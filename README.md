# CommitPulse

Track daily commit volume, LOC, and push cadence across all GitHub repos. Connect a Telegram bot to receive smart reminders only when it makes sense.

## Stack
- Turborepo + pnpm monorepo
- Next.js (App Router) client
- Convex backend + cron jobs
- Clerk auth (dev mode)
- Telegram bot webhook via Next.js + Convex

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
- `CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`

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

Create one shared bot with BotFather and set a webhook to your Vercel deployment:

```bash
curl -X POST \"https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook\" \\
  -H \"Content-Type: application/json\" \\
  -d '{\"url\":\"https://<your-app>.vercel.app/api/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}'
```

Set `TELEGRAM_BOT_USERNAME` (without `@`). Users connect the bot inside the app and confirm login. Smart reminders run every 30 minutes via Convex cron.

## Clerk

Telegram sign-in creates users without email/phone. Ensure your Clerk instance allows username-only users, or add required fields in the `/api/telegram/complete` handler.

## Security notes

- GitHub tokens are stored server-side for sync/notifications. Keep the Telegram bot token in server env variables.
- Avoid sharing `.env` files or PATs; rotate tokens if they ever leak.
