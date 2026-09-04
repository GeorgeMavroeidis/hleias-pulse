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

## Known issues (last verified 2026-09-04, end of day)

Ordered by severity. Verified against the live project, not inherited from docs.

1. **🔴 No user-facing report / block / mute.** Moderation exists only in the admin
   dashboard. Apple Guideline 1.2 requires content filtering, a report mechanism, user
   blocking and published contact info for every UGC app. Guaranteed App Store rejection
   without it. **Margaris owns this — it is the current Week 1 task.**
2. **🟠 Signed-out users hit a raw `AuthApiError` on any write.** `ensurePulseUserId()`
   (`src/lib/hp-api.ts`) falls back to `signInAnonymously()`, which is disabled on the
   project, and it gates **24 write paths**. **Decision made: accounts are required — we are
   not enabling anonymous posting.** The work is to make those paths open the sign-in sheet
   instead of throwing. Not yet implemented.
3. **🟠 The image migration is written but not applied.**
   `20260904210000_cors_friendly_image_urls.sql` is merged to `main`; the live database
   still holds the old `commons.wikimedia.org` URLs. Until it runs, marker images download
   at full 1200-2000px size on every visit. Needs `supabase db push`.
4. **🟡 Two smoke scripts target the wrong database.** `smoke-auth-profile.ts` and
   `smoke-live-surfaces.ts` hardcode `projectRef = "uihwsndveblfgmlhdngi"`; the app uses
   `kfxfnqryfmuxiwlswyyn`, and that other project does not exist in the account.
5. **🟡 `PulseApp.tsx` is ~7,000 lines**, `styles.css` ~4,000. Splitting them is the
   prerequisite for two people working in parallel. Next task after report/block.
   **Do not start new work inside `PulseApp.tsx` until the split lands.**
6. **🟡 Third-party hotlinked images.** Some place photos come from `visit-olympia.gr`,
   `visitkatakolon.gr` and `justforonesummer.com`. CORS and licensing both unresolved.
7. **🟡 Leftover test data.** ~15 `@hleiaspulse-audit.test` accounts and a few issued deal
   codes from the 2026-09-04 audit need deleting. The Lechaina deal reads "roday".
8. **🟡 `main` is not branch-protected.** CI runs but nothing enforces it.

### Fixed on 2026-09-04 — do not re-diagnose

- **Posting, commenting, places, stories and meet events.** All five failed with
  `[42501] new row violates row-level security policy`. The write was always fine; the
  `.insert(...).select(...)` read-back had no matching SELECT policy for an author's own
  `pending` row. Fixed by `20260904190000_authors_can_read_own_content.sql`.
- **Map basemap.** CARTO began returning an "API KEY REQUIRED" watermark tile with HTTP 200.
  Now defaults to keyless OpenStreetMap, overridable via `VITE_MAP_TILE_URL`. A keyed
  provider is still needed before public launch.
- **Migration history.** All 20 migrations had been applied by hand and were untracked;
  history is repaired and the CLI now manages the schema. A duplicate version number was
  also resolved.

Verified working end to end: signup, bootstrap reads (51 places), create post, add comment,
create place, create story, create meet event, meet RSVP, and the full deal-coupon pipeline
(`issue_deal_code` → `redeem_deal_code` → `deal_redemptions`).

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
