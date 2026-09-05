# ΗΛΕΙΑ PULSE

A mobile-first social map of the Ilia region, Peloponnese, Greece. Think Google Maps ×
Instagram × Twitter, for locals and tourists. Locals surface what is actually happening;
tourists get recommendations from real people instead of review sites. Partner shops and
cafés run deals that users redeem in-app — that is the revenue model.

Ships as an **iOS app first** (Capacitor shell), with a Cloudflare static web build.

See [ROADMAP.md](ROADMAP.md) for what is being built and in what order.

## Stack

React 19 · Vite 7 · TanStack Start/Router · Tailwind 4 · Leaflet + OpenStreetMap ·
Supabase (Postgres + Auth + Storage + RLS) · Capacitor (iOS) · TypeScript ·
Cloudflare Workers for the web deploy.

## Local development

Node.js 22, and the npm version pinned in `package.json`.

```sh
npm ci
npm run dev          # http://localhost:8080
```

Before opening a Pull Request:

```sh
npm run lint                 # 0 errors expected (3 known warnings)
npx tsc --noEmit
npm run build
npm run test:intelligence
npm run test:discovery
npm run test:map-visuals
```

iOS:

```sh
npm run ios:sync && npm run ios:open
```

## Security

**RLS is the only boundary this application has.** Supabase's default privileges give the
`anon` role a blanket SELECT on tables our migrations never granted it, so a row-level
policy is the only thing keeping private tables shut. Read
[docs/ARCHITECTURE-security.md](docs/ARCHITECTURE-security.md) before touching
`supabase/**`.

Never commit `.env`, credentials, service-role keys, or database passwords. Browser code
uses only the Supabase **publishable/anon** key — a service-role key must never enter
frontend code. The Supabase project reference is not a secret.

## Collaboration

Two people work in this repository and **both are called Giorgos** — read the surname, not
the first name. Ownership lanes are encoded in [.github/CODEOWNERS](.github/CODEOWNERS) and
explained in [CLAUDE.md](CLAUDE.md).

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. All work happens on a branch
and reaches `main` through a Pull Request. Greek-language onboarding is in
[TEAM_WORKFLOW.md](TEAM_WORKFLOW.md).

## A note on the older documents

`HANDOFF.md`, `GITHUB_PUSH_INSTRUCTIONS.md`, `SUPABASE_BACKEND_PLAN.md` and
`AUTH_BACKEND_IMPLEMENTATION.md` are historical reference. They may mention a previous
owner, repository, SSH identity or local path, and some of their claims have since proven
wrong. This repository's canonical remote is `GeorgeMavroeidis/hleias-pulse`. When a
document and the running code disagree, the code wins — verify before relying on either.
