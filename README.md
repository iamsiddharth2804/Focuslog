# FocusLog

> "I spent 6 hours in the library." — FocusLog shows exactly how.

FocusLog tracks a whole study day. That covers the session itself, each focus block, breaks and phone time. From those records it builds a timeline of your day, analytics, goals and an end-of-day reflection. Every number is computed from timestamped records in PostgreSQL, so the totals are never estimated.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Radix/shadcn-style UI · Lucide · Recharts · Framer Motion · PostgreSQL · Drizzle ORM

---

## Quick start

You need **Node 20+** and **PostgreSQL 14+**.

```bash
npm install
cp .env.example .env          # set DATABASE_URL (and APP_URL in production)
createdb focuslog             # or create the database any way you like
npm run db:migrate            # applies drizzle/0000_init.sql
npm run dev                   # http://localhost:3000
```

**For everyday use, run the production build.** It is much faster than `npm run dev`, which prepares every page the first time you open it:

```bash
npm run build     # once (2–3 min), and again after each update
npm start         # every day — starts in seconds
```

### Updating from an older version

Unzip the new version over the old folder (keep your `.env`), then run:

```bash
npm install
npm run db:migrate   # adds new columns; existing data is untouched
npm run build
npm start
```

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_URL` | yes | Public URL, used for OAuth redirects and reset links |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables "Continue with Google". The button stays hidden while these are empty. |

**Google sign-in.**
1. Create an OAuth client in Google Cloud Console.
2. Add `${APP_URL}/api/auth/google/callback` as an authorized redirect URI.
3. Put the client ID and secret in `.env`.

A Google account whose email is verified and matches an existing user is linked to that user.

**Password reset.** V1 has no email provider. The reset link is printed to the **server console**. To send real emails, wire a provider (Resend, Postmark, SES…) into `src/app/api/auth/forgot-password/route.ts`.

---

## How it works

### Two clocks, one source of truth

- **Daily session**: the whole stretch you're "at the library". You can start it, pause it and end it.
- **Activity**: what you're doing inside the session. It is one of `FOCUS`, `BREAK`, `PHONE` or `OTHER`. At most one activity is open at a time.
- **Idle time** is session time with no activity running. Nothing is hidden.

The database is the source of truth. Elapsed time always comes from `started_at`, the pause intervals and `ended_at`. It is never counted with `setInterval`. That gives you:

- **Refresh or close the tab:** nothing is lost, and the clock keeps running.
- **Pauses:** paused time is excluded everywhere.
- **Pomodoros:** a pomodoro ends at exactly its planned moment, even if no tab is open. `finalizeExpired` closes it lazily on the next read.
- **Several tabs at once:** tabs sync through a `BroadcastChannel`, and every mutation carries the id of the activity the tab thinks is running. A stale tab gets `409 STALE_STATE` and refreshes instead of overwriting newer data.
- **Concurrent writes:** each user's mutations are serialized with `pg_advisory_xact_lock`. Partial unique indexes guarantee at most one open session and one open activity per user.
- **Forgotten sessions:** if you leave a session open overnight, you're offered "End at last activity" so the forgotten hours don't count.

### Pomodoro cycles

A plan has four numbers: **focus**, **short break**, **long break**, and **long break after N focus sessions** (for example 40 / 5 / 15 / 4). The presets are 25·5, 40·5, 50·10 and 90·15, or you can pick **Custom**. The last plan you used becomes your default, and you can also set it in **Settings → Pomodoro**.

- Focus blocks and breaks always **count down**. Phone time counts up, because it measures how long you were away.
- A focus session counts toward the cycle only if it runs to zero. Stopping early is recorded as *finished*, not as a completed pomodoro.
- The long break is due once N focus sessions are complete, and it stays due until you take it. When the long break ends, a new cycle starts.
- Each block stores its plan in `activity_sessions.mode` (`40/5/15x4` for focus; `S:…` or `L:…` for short and long breaks). Changing your defaults mid-cycle therefore doesn't change the cycle you're in.
- **Auto-start** (optional, separate switches for breaks and for the next focus) starts the next block at the exact second the previous one ended. It only does this when the block ended within the last minute, so a closed laptop never keeps "studying" all afternoon.

### Speed

Every click is drawn on screen immediately, using the same rules as the server. Requests are then sent in order through a queue, and the server's answer replaces the prediction. Each request carries the moment you clicked. The server records that time, within limits: never in the future, at most 30 s back, and never before the last recorded event. That way paused time matches exactly what was on screen.

On the server, a click costs about 5 database round trips. The lock and the first reads travel together, the state is read in one parallel batch, and the signed-in user is cached for 15 s. With a distant database (such as India → Singapore), that is roughly 0.4 s in the background, and you never wait for it.

If your connection pooler rejects prepared statements, set `DB_PREPARE=false` in `.env`.

### Productivity score

```
Productivity = Focused study time ÷ Active session time × 100
```

Session pauses are excluded from the session time. The formula and the inputs are always shown next to the score.

### Goals and streaks

Goals are **versioned**. Changing a target closes the old goal as of yesterday and starts a new one today. Past days are therefore always judged against the target that was in effect on that day. A streak day counts when you reach that day's daily goal; if no daily goal was set, any study counts.

### Timezones

Each user has a timezone (detected at sign-up, changeable in Settings). Intervals are split at local midnight and at local hour boundaries, so a session that crosses midnight lands on the correct days. Half-hour offsets such as IST are handled correctly.

---

## Project structure

```
src/
  app/
    (auth)/            login, register, forgot/reset password
    onboarding/        3-step setup (areas, daily goal, weekly goal)
    (app)/             authenticated app: dashboard, study, study/[id], timer,
                       analytics, calendar, goals, settings, summary/[id]
    api/               JSON API (every route is user-scoped)
  server/              business logic: tracking, analytics, insights, goals, study, account
  db/                  Drizzle schema + client
  lib/                 time math, validation (zod), API helpers, auth
  components/          UI primitives, shell, tracking widgets, charts
drizzle/               SQL migrations
scripts/migrate.ts     migration runner
```

**Isolation.** Every query filters by the signed-in user's id. Foreign references such as `studyAreaId`, `taskId` and `dailySessionId` are re-checked for ownership before they are written. Another user's ids return `404`.

---

## Built for what comes next

- **Mobile phone-usage sync.** `activity_sessions` has a `source` column (`WEB`, `MOBILE`, `MANUAL`) and a `label` column for app names such as "Instagram". A mobile companion can post `PHONE` activities with `source: MOBILE`, and every chart picks them up unchanged.
- **AI insights.** Insights come from an `InsightProvider` interface (`src/server/insights.ts`). V1 ships a deterministic, rule-based provider. An AI provider would receive the same precomputed `InsightContext` (numbers, never raw rows) and return the same `Insight[]` shape, so no UI changes are needed.

## Not in V1 (by design)

AI chat, social features or leaderboards, notifications, payments, and automatic phone tracking.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | apply migrations |
| `npm run db:generate` | generate a migration after editing `src/db/schema.ts` |
| `npm run db:studio` | Drizzle Studio |
