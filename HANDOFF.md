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
