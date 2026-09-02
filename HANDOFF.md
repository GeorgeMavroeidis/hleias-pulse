# ΗΛΕΙΑ PULSE Handoff

Last updated: 2026-08-27

## Repository And Workflow

- Repository: `GeorgeMavroeidis/hleias-pulse`
- George's working branch: `mavroeidis-main`
- Shared branches: `main` and `margaris-main` (never change or merge them directly)
- Every code task starts from an updated `mavroeidis-main` on a new `codex/...` branch.
- Feature branches are pushed and merged into `mavroeidis-main` through pull requests.

```sh
git fetch origin
git switch mavroeidis-main
git pull --ff-only origin mavroeidis-main
git switch -c codex/<descriptive-feature-name>
```

## Local Development

George's Windows checkout:

```text
C:\Users\user\Desktop\hleias-pulse-mavroeidis
```

```bat
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/`.

Verification:

```bat
npm.cmd run lint
npm.cmd run build
```

## Current Product State

The app is a mobile-first React 19 and Vite experience backed by Supabase. It includes:

- A Leaflet/OpenStreetMap social map with real Ilia locations.
- Zoom-responsive pulse and photo markers.
- Places, posts, comments, stories, routes, likes, saves, Meet events, and RSVPs.
- Supabase authentication, profiles, posting identity, avatars, and activity state.
- An admin workspace for content, moderation, Meet events, and team roles.
- Static Cloudflare output and a Capacitor iOS shell.
- Greek-first bilingual UI through `src/lib/i18n.tsx` and `useI18n()`.

The map marker work and the admin-badge startup fix are included in `mavroeidis-main`.

## Product Decisions

- Keep `src/lib/i18n.tsx` and `useI18n()` as the only translation system.
- Do not introduce or merge the separate `useLang()` / `language-context` system.
- Cultural events developed on `margaris-main` are not integrated yet. Treat that as a separate,
  reviewed integration task; do not merge the branch directly.
- Before adding, changing, or applying a Supabase migration, ask George explicitly.
- Never deploy to production without George's explicit approval.
- Never commit `.env` files, passwords, service-role keys, API tokens, or other secrets.

## Important Source Files

- `src/components/hp/PulseApp.tsx`: main app shell and product flows.
- `src/components/hp/SocialMap.tsx`: Leaflet map and marker behavior.
- `src/components/hp/AuthAccountSheets.tsx`: active authentication and account UI.
- `src/components/admin/AdminDashboard.tsx`: admin workspace.
- `src/lib/hp-api.ts`: Supabase-backed app data access.
- `src/lib/admin-api.ts`: admin data access and roles.
- `src/lib/i18n.tsx`: shared Greek/English translations.
- `src/lib/supabase/client.ts`: browser-safe Supabase client configuration.
- `vite.static.config.ts`: Cloudflare static build.

`src/components/hp/ProfileSheet.tsx` is legacy display code; the active account surface is
`AuthAccountSheets.tsx`.

## Safety Checklist

- Review `git status --short` and `git diff --cached` before every commit.
- Stage only intentional files.
- Do not stage `src/routeTree.gen.ts` for unexplained line-ending-only changes.
- Use small, clear commits.
- Push only the current `codex/...` feature branch.
- Never force-push shared branches.

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
- The Tourist "Must-see today" deck (top of the Routes tab, shown only for `defaultIdentity === "TOURIST"`) pins Ancient Olympia via a hardcoded `TEMP_FEATURED_PLACE_IDS` list in `src/components/hp/PulseApp.tsx` because the hotness ranking alone buries it. This is a temporary stopgap — replace it with a real `places.featured` column set from the admin panel (phase 2) and delete the constant.

## Guardrails For Future Work

- Keep the visual direction local, tactile, and mobile-first.
- Do not reintroduce fake `live` claims, fake metrics, hype copy, or blinking AI-style effects.
- Prefer real coordinates, real place names, and conservative copy.
- Verify mobile viewport behavior after layout changes.
- Keep secrets out of git and deployment uploads.
- Keep GitHub disconnected unless explicitly asked to add a remote and push.
