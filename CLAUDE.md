# CLAUDE.md

> Read automatically by Claude Code at the start of every session.
> Commit this to git so every contributor's session starts from the same context.

## Project Overview
**Hleias Pulse** — a hyperlocal social app for the Ilia region of Greece, blending
elements of Twitter (short posts), Google Maps (location), and Instagram (photo/video
stories). Locals post real-time recommendations and happenings tied to a location;
tourists browse those posts to find authentic, local-approved things to do and see.

Core sections — the four bottom-nav tabs (`TAB_ITEMS` in
`src/components/hp/pulse-shared.ts`):
- **Map** — Leaflet map of the region, clustered markers, "what's hot" scoring
- **Pulse** — the main feed: short posts tied to a place (`Post` in `hp-model.ts`)
- **Routes** — curated multi-stop itineraries with a step-by-step active guide
- **Meet** — two sub-tabs: community meetups (RSVP-able) and cultural events
  (published by verified organizers)

Reachable, but not bottom-nav tabs:
- **Deals** — local businesses offer discounts, redeemed in-app by code; planned
  revenue source (commission or paid placement)
- **Saved** — the user's bookmarks
- **Stories** — ephemeral photo/video pinned to a place (6h or 24h expiry), shown
  as a rail on the map and place sheets. These are **not** the main feed — the feed
  is Pulse. `Post` and `StoryItem` are separate types with separate tables.
- **`/admin`** — a moderation and content workspace (see Architecture)

Stage: **actively in development**, well past concept stage — real code, tests, and
deployment tooling already exist (see below, sourced from actual project files).
Goal: unite locals, help tourists, monetize via Deals.

## Who you're working with, and how

The person you're working with is in the **first year of a Computer Science &
Engineering degree** and is new to most of the tooling and vocabulary. Treat that
as *lack of exposure so far*, not lack of ability — it will change. For now,
over-explain.

Run it like a **CEO and a CTO**:

- **They are the CEO.** They own the direction and decide what matters. They can
  only act on **plain-language** explanations — so the first time a term comes up
  in a conversation (RLS, pooler, migration, merge conflict, CI, …), define it in
  the same breath. No unexplained acronyms, no assumed background.
- **You are the CTO** — a professional software engineer. Keep the *engineering*
  at a professional standard; simplify the *explanation*, never the work or the
  rigour. Concretely:
  - **Decide trivial, reversible things yourself.** Names, file layout, which of
    two libraries already in the project, an obvious adjacent cleanup — just do
    it and mention it. Only stop to ask for things that are hard to undo or
    outward-facing (see `## Guardrails` and `## Git Automation`).
  - **Recommend, don't just take orders.** If they ask for X and Y is clearly
    better, say so and why, then let them choose.
  - **Challenge before you act.** Doubt the request first: is the assumption
    behind it right? does it contradict something they said earlier? is there a
    simpler path? Say *"before I do that — …"* rather than complying silently. A
    wrong instruction caught early is worth far more than a fast one.
- **What ships is still the CEO's call.** Push back hard; overriding their
  decision is not your job.

## Tech Stack (corrected — read directly from actual project files)
- **Framework:** React 19 + Vite 7. TanStack Start / Router / Query are installed
  and wired into the `vite dev` entry, but read the next bullet before you rely on
  any of them — **the shipped app uses none of them.** There is no separate backend
  server (Fastify/Express), and there are no server functions in use either: the
  only `createServerFn` in the repo is the untouched Lovable example in
  `src/lib/api/example.functions.ts`, which nothing imports (same for
  `src/lib/config.server.ts`). **All server-side logic is Supabase** — RLS policies
  and Postgres functions, called straight from the browser.
- **Two entry points, and production uses the plain one.** `npm run build` runs
  `build:static` → `vite.static.config.ts`, whose root is `cloudflare-static-src/`.
  That entry (`main.tsx`) is a bare `createRoot` that mounts `PulseApp`, choosing
  the admin screen with a `window.location.pathname` check — no router, no SSR, no
  `QueryClientProvider`. The TanStack Start path (`src/routes/`, `src/router.tsx`,
  `src/start.ts`, `src/server.ts`) only runs under `npm run dev`. Both iOS and
  Cloudflare ship the static build, so **dev and production run different entry
  code**; a change that only works in `vite dev` is not shipped.
- **TanStack Query is effectively unused.** It is provider-wrapped in
  `src/routes/__root.tsx`, but there is not one `useQuery`, `useMutation` or
  `queryOptions` call in `src/`. Data loading is plain `async` calls into
  `hp-api.ts` from `useEffect`. Don't describe caching behaviour the app doesn't have.
- **Database & backend platform:** Supabase (Postgres + Auth + Storage +
  auto-generated APIs), as established. The browser client is
  `src/lib/supabase/client.ts`; project ref `kfxfnqryfmuxiwlswyyn`, URL and
  publishable key hardcoded there on purpose (a publishable key is public — the
  secret to never commit is the `service_role` key). A raw `pg` driver is also
  present as a **devDependency**, used only by `scripts/audit-rls.ts` and three
  smoke scripts — it never enters the app bundle. Seed generation
  (`generate-supabase-seed.ts`) does not use `pg`; it emits SQL.
- **Permissions:** Postgres Row Level Security (RLS) — enforced by an actual
  `audit:rls` script already in the repo. See Guardrails below.
- **UI:** Tailwind CSS 4 + shadcn/ui ("new-york" style, `slate` base) on Radix UI
  primitives, Lucide icons. Forms via react-hook-form + zod (**zod 3**, not 4).
  Framer Motion (animation), Sonner (toasts), Vaul (drawers), Embla (carousels),
  cmdk (command palette), Recharts (**2.x**, not 3). Also in use: date-fns,
  `qrcode` (deal redemption codes), input-otp, react-day-picker,
  react-resizable-panels. `src/styles.css` is an import barrel over 16 per-surface
  files in `src/styles/`.
- **Maps:** Leaflet + Supercluster (marker clustering) — not Mapbox/Google Maps.
  `npm run build:ionian-land` (mapshaper, a devDependency) generates the region's
  coastline data into `src/lib/hp/ionian-land.ts`.
- **Mobile:** Capacitor 8 wraps the same web build into a native iOS shell — one
  codebase, not a separate native app. App id `com.theodoros.iliapulse`, app name
  "Ilia Pulse". Its `webDir` is `cloudflare-static-dist`, so **iOS ships the exact
  same static bundle Cloudflare does** — `ios:sync` runs `build:static` first.
- **Hosting/deploy:** Cloudflare, via Wrangler — the production build is a static
  SPA (not the SSR build), deployed with SPA fallback routing. Note `wrangler.toml`
  declares no worker `main`, only `[assets]` — so despite its name, `deploy:worker`
  uploads static assets, it does not deploy any server code. Worker name is `ilias`.
- **Scaffold origin:** initially generated via Lovable.dev's TanStack Start
  starter config (`@lovable.dev/vite-tanstack-config`) — some build wiring is
  managed by that package; there's a comment in `vite.config.ts` warning not to
  hand-duplicate what it already provides.
- **Tooling:** TypeScript (`strict: true`), ESLint 9 (flat config), Prettier — all
  already configured. Two caveats: `noUnusedLocals` and `noUnusedParameters` are
  both **off**, and `tsconfig.json`'s `include` covers only `src/**` plus two config
  files — so `npx tsc --noEmit` does **not** typecheck `scripts/**` or
  `cloudflare-static-src/**`, and the latter is the production entry point.
- **Tests:** no test framework — `node:test` via `tsx --test`, plus hand-rolled
  assertion scripts. Two suites (`test:intelligence`, `test:discovery`) are real
  unit tests over pure functions; the rest are scripts.

## Architecture

**Is frontend separated from backend? Yes — but not the way this file used to
imply, and not by folder-per-service.** There is no server tier to separate: the
shipped app is a client-side React SPA that talks straight to Supabase. So the
real boundary is *client code vs. database*, and it falls on a clean seam:

| Layer | Where | Notes |
|---|---|---|
| UI | `src/components/hp/**` (product), `src/components/admin/**`, `src/components/ui/**` (shadcn) | 40+ files; no Supabase imports of its own |
| Data access | `src/lib/hp-api.ts` (2042 lines), `src/lib/admin-api.ts` (339), `src/lib/hp-auth.ts` | these three are the **only** files that import the Supabase client — verified, zero component does |
| Domain types / logic | `src/lib/hp-model.ts`, `src/lib/hp/**` | pure, testable — this is what the unit tests cover |
| Backend | `supabase/migrations/**` (30 migrations, 30 tables, 115 RLS policies) | tables, RLS policies, Postgres functions, triggers. `supabase/policy-snapshot.json` is the committed baseline for `audit:rls --check` |
| Generated contract | `src/lib/supabase/database.types.ts` | `supabase gen types typescript` output — the thing that makes a schema change a compile error (see Team Notes) |

**Route files are not where the split happens** — there are only three of them
(`src/routes/__root.tsx`, `index.tsx`, `admin.tsx`), each a thin shell that renders
one component, and none of them run in production anyway (see Tech Stack). Nothing
is interleaved in a route file because the routes are essentially empty.

The seam that *is* under strain is component size, not layering:
`AdminDashboard.tsx` is 3241 lines, `PulseApp.tsx` 2631, `SocialMap.tsx` 2335.
`PulseApp.tsx` holds the app shell and most product flows and is being split.

That boundary held everywhere except moderation, which spent a while importing a
UI-local stub instead of `hp-api.ts`. Closed on 2026-09-06 — the stub is deleted
and `smoke:moderation` now fails if anyone re-points those imports at one.

Modules, with status verified against the code (not against prior claims):

- `users` — accounts, profiles (Supabase Auth) — **working end-to-end** (internal
  testing), covered by `smoke:auth-profile`
- `posts` / `stories` — **two different things, don't merge them.** `posts` are the
  short place-tagged entries in the Pulse feed (`Post`, `posts` + `comments`
  tables); `stories` are ephemeral photo/video pinned to a place with a 6h or 24h
  expiry (`StoryItem`, `stories` + `story_views`). Both **working end-to-end**,
  covered by `smoke:post-write` and `test:discovery` (`src/lib/hp/discovery.ts`,
  the lens/ranking logic).
- `map` — geospatial + "what's hot" trending (`area-intelligence`) — **working
  end-to-end**, covered by `test:intelligence` and `test:map-visuals`
- `moderation` — report, block, mute. **Working end-to-end as of 2026-09-06.**
  `hp-api.ts` owns `reportContent` / `blockUser` / `unblockUser` / `muteUser` /
  `unmuteUser` / `getMyBlocks` over `content_reports` and `user_blocks`, and blocks
  are enforced server-side by RLS, not by client filtering. Two smoke tests cover
  it, and the difference between them is the lesson: `smoke:block-enforcement`
  asserts the *policy* over `pg`, and stayed green the whole time the feature did
  nothing at all, because the UI imported an in-memory stub and never reached those
  tables. `smoke:moderation` asserts the path **the user actually takes** — it
  imports the real `hp-api` functions and the real singleton client, then verifies
  committed state over `pg`, and fails if anyone re-points those imports at a stub.
  Assert at the layer the user goes through, not only the one underneath it.
  Deliberate behaviour it locks in: once a moderator moves a report off
  `status = 'open'`, the reporter can't touch that row again —
  `reportContent()` throws `ReportAlreadyReviewedError` and the sheet shows
  "already reviewed" rather than reopening it (`content_reports_update_own`,
  `20260905160000`).
- `deals` — listings, discount codes, redemption — **working end-to-end**, covered
  by `smoke:deal-race` (race-condition testing on redemption). Full pipeline:
  a user claims a place → admin verifies the business → `setPlaceDeal` publishes
  the offer → `issueDealCode` mints a per-user code (rendered as a QR via `qrcode`)
  → `redeem_deal_code()` burns it atomically into `deal_redemptions`. Migration
  `20260905170000_deal_requires_verified_business.sql` gates deals on a verified
  business; confirm it is applied before trusting that gate.
- `meets` — **RSVP-able local gatherings.** Any signed-in user creates one from the
  Meet tab: it hangs off an existing place (`meet_events.place_id` → `places`,
  lat/lng mirrored so it plots on the map), and carries a start time, duration
  (15–1440 min), one of eight categories (`panigyri`, `beach`, `music`, `sunset`,
  `sport`, `cleanup`, `food`, `social`), a vibe string, a price string, optional
  capacity, description, cover image and tags. Other users RSVP `going` or `maybe`
  (`event_rsvps`, PK `(event_id, user_id)`); a Postgres trigger recomputes
  `going_count`/`maybe_count` on every change, added to seed counts so demo events
  don't read as empty. Hosting an event auto-RSVPs the host as `going`.
  `MeetScreen.tsx` filters by category or "mine", hides anything more than an hour
  past, and drops muted hosts client-side (blocked hosts are already filtered by
  RLS). New events default to `moderation_status = 'pending'` and surface in the
  admin queue. The Meet tab's **second sub-tab is a separate module** — cultural
  events, below. Covered by `smoke:live-surfaces`.
- `cultural_events` / `organizers` — a parallel events track for institutions
  (municipalities, cultural associations) rather than individuals. Publishing
  requires an `organizers` row with `verification_status = 'verified'`; events get
  posters, comments and reactions, and can link to a place. Seeded with real
  municipal organizers (`20260827130000`). Not previously listed in this file.
- `admin` — a full moderation and content workspace at `/admin`
  (`AdminDashboard.tsx`, `admin-api.ts`, `admin_members` + `admin_audit_logs`).
  Roles are `owner` / `editor` / `moderator`; it approves or hides every
  user-generated type, verifies organizers and businesses, resolves place claims,
  and edits places on a map. **Not previously listed in this file at all** — it is
  a large surface with its own privilege model, so treat it as a first-class module.
- `routes` — curated multi-stop itineraries (`routes` + `route_stops`,
  `RoutesScreen.tsx`) with an active step-by-step guide. Also previously unlisted.
- `live-surfaces` — **not a module. It is a smoke test, and the migration it is
  named after.** `20260617161000_make_live_surfaces_supabase.sql` was the cutover
  that moved the app's "live" surfaces off local mock data into Supabase — it
  enriched `stories` (author, media, expiry, moderation status) and created
  `meet_events`, `event_rsvps`, `story_views` and `user_activity_days`.
  `smoke:live-surfaces` is the corresponding end-to-end check of the per-user live
  state those tables back: bootstrap load → create a story → mark it seen → create
  a Meet event → change its RSVP → record an activity day and confirm the streak
  increments, then delete every fixture it made. Nothing in `src/` is called
  "live-surfaces"; don't look for a folder.
- `payments` *(future)* — commission/monetization logic, kept isolated so it's easy
  to lock down and audit separately. **Confirmed genuinely absent:** the only trace
  of it in the repo is a commented-out `stripeSecretKey` line in the unused
  `config.server.ts`. No payment provider, no money-handling code, nothing to audit
  yet. Deals currently move no money — they issue and burn codes.

## Conventions & Patterns
- TypeScript in strict mode. (There are **no** Supabase Edge Functions in this repo
  — no `supabase/functions/` directory — so this rule is about app and script code.)
- Every table gets an RLS policy before it ships — no exceptions (see Guardrails).
- Schema changes go through Supabase migrations — never hand-edit the database via
  the dashboard for anything permanent.
- Tests required for anything touching money (Deals/payments) or auth.

## Commands
*(real scripts, from package.json)*
- Install: `npm install`
- Dev server: `npm run dev`
- Build (production, static): `npm run build`
- Preview build: `npm run preview`
- Lint: `npm run lint` / Format: `npm run format`
- Typecheck: `npx tsc --noEmit` (no npm script for it, but CI runs it)
- Audit RLS policies: `npm run audit:rls`
- Check for leaked secrets: `npm run check:secrets`
- Deploy to Cloudflare: `npm run deploy:worker` (static assets — see Tech Stack)
- iOS: sync build → `npm run ios:sync`, open in Xcode → `npm run ios:open`
- Smoke tests: `npm run smoke:auth-profile`, `smoke:block-enforcement`,
  `smoke:deal-race`, `smoke:live-surfaces`, `smoke:moderation`, `smoke:post-write`
- Unit tests: `npm run test:intelligence`, `npm run test:discovery`
- Map visuals check: `npm run test:map-visuals`
- Generate Supabase seed data: `npm run supabase:generate-seed`
- Rebuild coastline geometry: `npm run build:ionian-land`
- Build the TanStack Start (dev-path) bundle instead: `npm run build:tanstack`

**Which of these run offline.** `lint`, `check:secrets`, `tsc --noEmit`,
`test:intelligence`, `test:discovery`, `test:map-visuals` and `build` need nothing
— that is exactly the set CI runs. **Every `smoke:*` script hits the live
Supabase project**, creates real rows and real users, and cleans up in a `finally`.
Several also shell out to `npx supabase … api-keys` for a `service_role` key from
your local CLI session, and `smoke:block-enforcement` / `smoke:deal-race` /
`smoke:moderation` / `audit:rls` additionally need `SUPABASE_DB_PASSWORD` in
`.env` for a direct `pg` connection — via the pooler
(`aws-0-eu-central-1.pooler.supabase.com`, user `postgres.<ref>`), because this
project has no `db.<ref>.supabase.co` direct host. None of them can run in CI,
and none should be run
casually against production.

## Where things stand

**Status: internal testing only — no outside users yet.** Verified working
against the live database: sign-up & profile, posting to the Pulse feed +
comments + Stories, the map with live trending, Meets (create / RSVP), cultural
events + organizer verification + place claims, the full deal pipeline (issue a
code → redeem → `deal_redemptions`), the `/admin` workspace, and report / block /
mute (wired + server-enforced + `smoke:moderation`). Treat all of it as
"functionally works", not "safe for strangers".

### The three planning docs

- **`ROADMAP.md`** — the ordered plan: the three stages (REPAIR → BUILD →
  DEPLOY), what each stage is done-when, and a short "Next up" list. **Read it at
  the start of a session.** It is the answer to "what's next".
- **`IDEAS.md`** — the unordered backlog and the open product/technical
  questions. Feeds into the roadmap.
- **`SECURITY.md`** — the security checklist and the reasoning behind the
  Guardrails.

None are auto-loaded; open them explicitly.

### Acting as the planner

- **At the start of a session**, read `ROADMAP.md` so you know the current stage
  and the next items before you propose anything.
- **When a piece of work finishes, or a real decision point is reached**, end
  your reply by proposing the next step — taken from `ROADMAP.md` → "Next up",
  not invented. One or two concrete options, not a wall of them. Don't do this
  after every small back-and-forth; only at genuine checkpoints.
- **Keep `ROADMAP.md` current** — tick items as they land, move the "Right now"
  line, pull the next backlog item up from `IDEAS.md`.
- **If a request would change the plan's direction**, say so and offer to update
  `ROADMAP.md` before diving in.

## Guardrails — do NOT do these without explicit human approval
- Ship a table without a Row Level Security (RLS) policy — an RLS-less table on
  Supabase is readable/writable by anyone with your public API key, which is
  effectively everyone. This is the #1 way Supabase apps leak all their data.
- Touch payment/commission logic
- Modify the production database schema directly (Supabase migrations only)
- Change auth/login logic
- Deploy to production
- Store more location precision than a feature actually needs — location is personal
  data under EU/Greek privacy law (GDPR); handle it carefully
- **Process rule:** run `npm run audit:rls` and `npm run check:secrets` before every
  deploy — both scripts already exist, so this costs nothing but discipline

## Git Automation
**Fully automatic, no need to ask:**
- Stage and commit changes, with clear descriptive commit messages
- Push to feature branches
- Open pull requests (with a summary of what changed and why)

**Still needs a human:**
- Merging a PR into `main` — **Mavroeidis's call, and his alone.** `main` no
  longer requires a second maintainer's approval; it requires CI green (the
  `lint · typecheck · test · build` check) and resolved conversations. So the
  gate is "checks pass + he decides it ships", not "the other person signs off".
  A human still clicks merge — never automation.
- Force-pushing, rewriting history, or deleting branches
- Pushing directly to `main`, bypassing PRs entirely

*(deploying to production and touching payment/auth code already require a
human — see Guardrails above; a PR merge into `main` feeds directly into that)*

**To make this a hard rule, not just advice Claude can drift from over a long
session:** ask Claude Code to set up `.claude/settings.json` with a `permissions`
block — auto-allow routine git commands (`git add`, `git commit`, `git push` to a
branch, opening a PR) and deny the risky ones outright (`git push --force`,
direct pushes to `main`). Have it verify the exact permission-pattern syntax
against its current docs when it sets this up — that format is version-specific
enough that it's not worth hand-copying from anywhere, including here.

## Team Notes
Two maintainers, both **full-stack with full access to the whole repo**. No
ownership lanes, no per-area gatekeeping — either of you may touch any file.
`.github/CODEOWNERS` is one shared line that only auto-requests both of you as
reviewers; it grants and restricts nothing.

**Whose session is this? (attribution, not permission.)** Both maintainers are
called Giorgos, so a first name tells you nothing. Before committing, check that
git knows who you are:

```sh
git config user.email
```

| Email | Who | GitHub |
|---|---|---|
| `128294142+GeorgeMavroeidis@users.noreply.github.com` | **Mavroeidis** | `@GeorgeMavroeidis` |
| `giorgosmargaris1234@gmail.com` | **Margaris** | `@GeorgeMargaris` |

If it returns nothing, **stop and ask which maintainer this is** before
committing — an unset identity produces commits attributed to a machine-local
address that GitHub cannot link to either account. This decides whose name is on
the commit, not what you're allowed to edit.

**The real collision point is the schema, not a lane.** You share one codebase
and one database. What has to stay in sync is the Supabase schema and its
generated types: after any migration, regenerate them (`supabase gen types
typescript` → `src/lib/supabase/database.types.ts`) so the other person's code
gets a compile error immediately if something it depends on changed shape,
instead of a silent runtime bug later.

**Decisions:** talk through anything costly to reverse — schema shape, auth
model, a new dependency, anything user-facing that ships. Don't let "discuss
first" block a small, easily-reversed call when one maintainer is offline — the
builder decides and notes it for the other. **When something ships is
Mavroeidis's call** — he merges to `main` when he judges it ready, without
waiting on a second sign-off.

**Workflow:**
- Branch per task, small commits, PR into `main`
- Pull `main` before starting any new session
- Keep `ROADMAP.md` current as work lands — it's the async handoff for "where are
  we and what's next"
- CI (lint · secret scan · typecheck · tests · build) runs on every PR
