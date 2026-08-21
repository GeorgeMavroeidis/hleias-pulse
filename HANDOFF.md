# ΗΛΕΙΑ PULSE Local Handoff

Last updated: 2026-06-14 13:45 EEST

## Project Location

- Project path: `/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/ilia-pulse-local`
- Local dev URL: `http://127.0.0.1:5173/`
- Static deploy folder: `/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/ilia-pulse-local/cloudflare-static-dist`
- Cloudflare upload zip: `/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-cloudflare-static-20260613-231243.zip`
- Full local backup: `/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-local-20260613-230730-full.tar.gz`

## Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- Leaflet with OpenStreetMap tiles
- TanStack Start project shell, plus a separate static Vite build for Cloudflare drag-and-drop upload

## Current Status

The app is a local, mobile-first frontend prototype for ΗΛΕΙΑ PULSE. It now has a real Leaflet/OpenStreetMap map, real coordinate-backed Ilia locations, working marker selection, post/detail modals, route views, saved state, comments, and a Cloudflare-ready static upload build.

The project is committed locally only. There is no GitHub remote configured, and nothing has been pushed online.

## Local Git State

Local repo was initialized inside:

`/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/ilia-pulse-local`

Branch:

`main`

Functional local commits created before this handoff update:

```text
4985ffa Add Cloudflare static upload build
e308248 Checkpoint frontend audit and map fixes
```

Remote check:

```bash
git remote -v
```

Expected output is empty. That means there is no GitHub remote and no online push target.

Ignored local/generated items:

- `.env`
- `node_modules/`
- `dist/`
- `cloudflare-static-dist/`

## What Was Fixed

- Removed fake-feeling visible labels like `LIVE`, `LIVE NOW`, `HOT`, and `MOVING`.
- Removed blinking/pulsing bubble animations from map markers.
- Replaced the decorative fake map with a real Leaflet/OpenStreetMap map.
- Added 51 real coordinate-backed Ilia-area places in `scripts/hp-seed-data.ts`.
- Fixed route/detail/comment screens that were breaking out of the mobile shell.
- Fixed post card interactions so post details can be opened.
- Made the route/detail screens respect the app frame instead of going fullscreen.
- Smoothed map zoom and pan behavior.
- Widened and softened map bounds so panning does not snap back aggressively.
- Reduced bottom-sheet snap aggression so slow drags hold intermediate heights.
- Removed the hidden drag handler from the `Tonight's pulse` content header so it does not steal normal scroll.
- Added defensive pointer-capture handling for sheet drag streams.
- Added a dedicated Cloudflare static upload build path.
- Added Supabase-backed creation for user posts and user-created places.
- Removed local-only write fallbacks: failed writes now roll back instead of leaving phantom local data.
- Added a `get_pulse_bootstrap` Supabase RPC so initial content loads through one explicit-column RPC instead of ten `select("*")` table requests.
- Added `npm run smoke:post-write` to exercise the same app API path used by the composer, verify the inserted post row, and clean it up.
- Added branded SEO/share metadata, favicon/app icons, web manifest, robots file, and a 1200x630 social preview image generated from the supplied ΗΛΕΙΑ PULSE logo.
- Share actions now produce real app links like `/?place=...`, `/?post=...`, and `/?route=...`; those links reopen the correct place, post, or route after Supabase data loads.

## Important Source Files

- `src/components/hp/PulseApp.tsx`
  Main app shell, bottom nav, bottom sheet, pulse feed, routes, saved view, modals, comments, and post/place composer.
- `src/components/hp/SocialMap.tsx`
  Leaflet map setup, OpenStreetMap tiles, marker generation, zoom/recenter controls, marker select behavior.
- `src/lib/hp-api.ts`
  Supabase-backed data access and app data mapping for places, posts, routes, events, comments, saves, and likes.
- `src/lib/supabase/client.ts`
  Static-build Supabase client using the project URL and publishable anon key.
- `src/lib/seo.ts`
  Shared SEO metadata constants for the TanStack shell.
- `scripts/hp-seed-data.ts`
  Seed-generation source data only; this is not imported by the frontend runtime.
- `src/styles.css`
  Global design tokens, map marker styling, app polish, focus states, responsive/mobile CSS.
- `cloudflare-static-src/index.html`
  Static-only HTML entry for Cloudflare upload builds.
- `public/`
  Branded icons, app manifest, robots file, and social preview image copied into both production build outputs.
- `cloudflare-static-src/main.tsx`
  Static-only React entry that renders `PulseApp` directly without TanStack Start SSR hydration.
- `vite.static.config.ts`
  Dedicated Vite config for building `cloudflare-static-dist`.
- `HANDOFF.md`
  This document.

## Environment And Secrets

`.env` exists locally and contains the Supabase DB password provided during the session.

Do not:

- Commit `.env`
- Upload `.env` to Cloudflare
- Paste the password into docs, screenshots, commits, chat, or logs

`.gitignore` was updated to keep `.env`, `.env.*`, `dist`, `node_modules`, and `cloudflare-static-dist` out of git.

## Backups Created

Full local backup archive:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-local-20260613-230730-full.tar.gz
```

Checksum:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-local-20260613-230730-full.tar.gz.sha256
```

This full archive includes `.env`, `.git`, source, `dist`, and `node_modules`.

Cloudflare static upload zip:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-cloudflare-static-20260613-231243.zip
```

Checksum:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-cloudflare-static-20260613-231243.zip.sha256
```

Cloudflare zip contents:

```text
index.html
assets/
assets/leaflet-src--ofLZOS8.js
assets/index-CDTnn8Uk.js
assets/index-C97oNM-F.css
```

## Cloudflare Upload Instructions

Use Cloudflare's **Upload your static files** option.

Upload this folder if selecting a folder:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/ilia-pulse-local/cloudflare-static-dist
```

Or upload this zip:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/local-backups/ilia-pulse-cloudflare-static-20260613-231243.zip
```

Do not upload:

- `ilia-pulse-local/`
- `dist/`
- `dist/server/`
- `node_modules/`
- `.env`
- The full backup tarball

The folder Cloudflare receives must have `index.html` at the top level and an `assets/` folder beside it.

## How To Rebuild

Run the local development app:

```bash
npm run dev
```

Build the normal TanStack Start project:

```bash
npm run build
```

Build the Cloudflare static upload folder:

```bash
npx vite build --config vite.static.config.ts
```

After that, upload:

```text
cloudflare-static-dist
```

## iOS Capacitor State

The React/Vite frontend has a local Capacitor iOS shell in:

```text
/Users/theodoroskapsalis/Projects/NOMOSILIASPROJECT/ilia-pulse-local/ios
```

Current native app identifiers:

- App name: `Ilia Pulse`
- Bundle ID: `com.theodoros.iliapulse`
- Web output copied into iOS from: `cloudflare-static-dist`

Useful commands:

```bash
npm run build:static
npx cap sync ios
npm run ios:open
```

Latest iPhone-specific fixes:

- Added `@capacitor/status-bar`.
- Configured `StatusBar.overlaysWebView = false` so the iOS time/wifi/battery area does not cover the ΗΛΕΙΑ PULSE header.
- Set Capacitor iOS `zoomEnabled = false`.
- Locked the app viewport and enabled `viewport-fit=cover`.
- Normalized `input`, `textarea`, and `select` to `16px` on touch devices so iOS does not zoom when typing comments or composer fields.
- Added safe-area top handling to the app shell and full-screen/detail modals.
- Replaced the default Capacitor app icon with the ΗΛΕΙΑ PULSE brand icon.

To test on the connected iPhone, open Xcode and run:

```text
Cmd+R
```

If iOS shows an old icon or old layout, delete the app from the iPhone once, then run again from Xcode.

## Verification Done

Frontend checks:

```bash
npx tsc --noEmit
npm run build
npm run lint
```

Static deploy check:

```bash
npx vite build --config vite.static.config.ts
```

Browser checks performed:

- Local app loaded at `http://127.0.0.1:5173/`.
- Static build loaded from a local server at `http://127.0.0.1:4175/`.
- Map rendered.
- OpenStreetMap tiles loaded.
- 51 place markers rendered.
- Supabase RLS smoke test passed for anonymous place insert, place avatar insert, post insert, and cleanup.
- Post-write smoke test passed: created a temporary post, verified its row text in Supabase, and deleted it.
- Bootstrap RPC check passed: `get_pulse_bootstrap` returns the app payload in one response.
- No horizontal overflow on mobile viewport.
- Map pan stayed where dragged and did not snap back.
- Slow sheet drag held an intermediate height instead of jumping to a snap point.
- Final console check only showed the normal React DevTools info message.

Lint state:

- 0 lint errors.
- 6 existing React fast-refresh warnings in shared `src/components/ui/*` files. These are from component files exporting helpers/constants and are not caused by the ΗΛΕΙΑ PULSE map or deploy fixes.

## Known Limitations

- The app now uses live Supabase reads/writes; the seed data remains only for regenerating `supabase/seed.sql`.
- New places require a photo URL and latitude/longitude in the current composer.
- Supabase password is stored locally only and must stay out of frontend code.
- Cloudflare drag-and-drop deploy serves the static frontend only.
- OpenStreetMap tiles load from the public OSM tile server.
- Seed images should be reviewed for licensing/source strategy before public production launch.

## Guardrails For Future Work

- Keep the visual direction local, tactile, and mobile-first.
- Do not reintroduce fake `live` claims, fake metrics, hype copy, or blinking AI-style effects.
- Prefer real coordinates, real place names, and conservative copy.
- Verify mobile viewport behavior after layout changes.
- Keep secrets out of git and deployment uploads.
- Keep GitHub disconnected unless explicitly asked to add a remote and push.
