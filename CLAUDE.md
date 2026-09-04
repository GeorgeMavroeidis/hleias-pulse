# CLAUDE.md — ΗΛΕΙΑ PULSE

Instructions for AI agents (Claude Code, Codex) working in this repo.
**Read [ROADMAP.md](ROADMAP.md) for what we are building and in what order.**

## What this is

A mobile-first social map of the Ilia region, Greece. Think Google Maps × Instagram ×
Twitter, for locals and tourists. Locals surface what is actually happening; tourists get
recommendations from real people instead of review sites. Partner shops and cafés run deals
that users redeem in-app — that is the revenue model.

Ships as an **iOS app first** (Capacitor shell), with a Cloudflare static web build.

## Stack

React 19 · Vite 7 · TanStack Start/Router · Tailwind 4 · Leaflet · Supabase (Postgres + Auth
+ Storage + RLS) · Capacitor (iOS) · TypeScript

## Ownership — do not cross without asking

| George (`@GeorgeMavroeidis`) | Margaris |
|---|---|
| `src/lib/**`, `src/lib/supabase/**` | Screens, sheets, composer |
| `supabase/**` — schema, RLS, migrations | Feed / Stories / Deals / Meet UI |
| `SocialMap.tsx`, map + discovery internals | `src/lib/i18n.tsx` copy |
| Monetization plumbing, auth, security | Onboarding, empty states, polish |
| CI, build, release pipeline | Product features and breadth |

Two people work here in parallel. **Never edit a file the other owns without agreeing first.**

## Workflow — non-negotiable

```sh
git fetch origin && git switch main && git pull --ff-only origin main
git switch -c <feat|fix|chore|docs>/<short-name>
```

- `main` is the only long-lived branch. **Never commit or push to it directly.**
- Open a PR into `main`. CI must be green. Delete the branch after merge.
- **Small PRs, merged daily.** A branch older than 48h is a merge conflict waiting to happen.
- Never force-push a shared branch.
- One task per session. Do not let scope sprawl across unrelated files.

## Hard rules

- **Ask George explicitly before adding, changing, or applying any Supabase migration.**
- Never commit `.env`, passwords, service-role keys, or API tokens.
- Never deploy to production without George's explicit approval.
- `src/lib/i18n.tsx` + `useI18n()` is the **only** translation system. Do not introduce
  `useLang()` / `language-context`.
- Greek-first copy. Conservative and concrete — no fake "live" claims, no invented metrics,
  no hype language.
- Do not mass-reformat files. It creates fake conflicts. Prettier config is settled.
- Do not stage `src/routeTree.gen.ts` for line-ending-only changes.

## Verify, don't assume

Docs in this repo have been wrong before. `HANDOFF.md` claimed posting worked; it does not
(see Known Issues). **Run the thing before reporting it works.**

```sh
npm run dev                  # http://localhost:8080
npx tsc --noEmit             # typecheck
npm run lint                 # 0 errors expected (3 known warnings)
npm run build                # static/Cloudflare build
npm run test:intelligence    # 8 tests
npm run test:discovery       # 9 tests
npm run test:map-visuals
npm run ios:sync && npm run ios:open
```

## Known issues (audited 2026-09-04)

Ordered by severity. Fix before building on top of them.

1. **🔴 Authors cannot read their own pending content.** New rows default to
   `moderation_status = 'pending'`, and the only SELECT policies are "published"
   and "admins". `hp-api.ts` creates rows with `.insert(...).select(...)`, whose
   RETURNING clause reads the row back — so the statement aborts with
   `[42501] new row violates row-level security policy`. It reads like a write
   rejection but the write is fine; the read-back is what fails. Posting,
   commenting, adding places, stories and meet events are all broken by this.
   Fix in `20260904190000_authors_can_read_own_content.sql`.
2. **🔴 No user-facing report / block / mute.** Moderation exists only in the admin dashboard.
   Apple Guideline 1.2 requires all three for UGC apps. Guaranteed App Store rejection.
3. **🟠 Anonymous sign-in is disabled** on the Supabase project, but `ensurePulseUserId()`
   (`src/lib/hp-api.ts`) falls back to `signInAnonymously()` and gates **24 write paths**.
   Signed-out users hit a raw `AuthApiError`. Either enable it or gate the UI behind login.
4. **🟠 Map tiles show `API KEY REQUIRED`** — CARTO basemap at `SocialMap.tsx:1446`.
5. **🟠 Place images fail CORS** — hotlinked from `commons.wikimedia.org`, which blocks
   cross-origin fetches. Rehost to Supabase Storage.
6. **🟡 Two smoke scripts target the wrong database.** `smoke-auth-profile.ts` and
   `smoke-live-surfaces.ts` hardcode `projectRef = "uihwsndveblfgmlhdngi"`; the app uses
   `kfxfnqryfmuxiwlswyyn`.
7. **🟡 `PulseApp.tsx` is ~7,000 lines**, `styles.css` ~4,000. Splitting these is the
   prerequisite for two people working in parallel. See ROADMAP Week 1.
8. **🟡 Leftover test data** — 4 audit accounts (`@hleiaspulse-audit.test`) and deal code
   `638CFA` need deleting from the Supabase dashboard.

Verified working: signup + session, bootstrap reads (51 places), meet RSVPs, post likes, and
the **full deal-coupon pipeline** (`issue_deal_code` → `redeem_deal_code` → `deal_redemptions`).

## Key files

| Path | What |
|---|---|
| `src/components/hp/PulseApp.tsx` | App shell and product flows (being split) |
| `src/components/hp/SocialMap.tsx` | Leaflet map, markers, clustering |
| `src/components/hp/AuthAccountSheets.tsx` | Active auth + account UI |
| `src/components/admin/AdminDashboard.tsx` | Admin workspace |
| `src/lib/hp-api.ts` | All Supabase-backed app data access |
| `src/lib/admin-api.ts` | Admin data access and roles |
| `src/lib/hp/discovery.ts`, `area-intelligence.ts` | Discovery lenses, area scoring |
| `src/lib/i18n.tsx` | Greek/English translations |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `vite.static.config.ts` | Cloudflare static build |

`src/components/hp/ProfileSheet.tsx` is legacy. The live account surface is `AuthAccountSheets.tsx`.

## Model guidance

- **Opus** — architecture, gnarly debugging, security review, planning, reviewing large diffs.
- **Sonnet** — the daily driver: implementing specified tasks, refactors, tests, UI.
- **Haiku** — renames, formatting, mechanical edits.

*Opus decides, Sonnet builds.* Use plan mode for anything large; `/code-review` before merging.
