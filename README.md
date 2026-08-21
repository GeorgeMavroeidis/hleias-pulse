# ΗΛΕΙΑ PULSE

Mobile-first social map for Ilia, Peloponnese, Greece. It combines an interactive map, location-based social posts and stories, Meet events, and routes.

## Stack

- React 19, TanStack Start, Vite 7, Tailwind CSS 4
- Leaflet and OpenStreetMap
- Supabase for Postgres, Auth, and Storage
- Capacitor for iOS
- Cloudflare Workers for deployment

## Local development

Use Node.js 22 and the npm version pinned in `package.json`.

```powershell
npm ci
npm run dev
```

Useful checks:

```powershell
npm run lint
npm run build
```

Do not commit `.env` files, credentials, service-role keys, or database passwords. The frontend must use only the Supabase publishable/anon key.

## Collaboration

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. All work happens in a branch and reaches `main` through a Pull Request.

Historical handoff and push documents in this repository may mention a previous owner, repository, SSH identity, or local paths. They are reference material only; this repository's canonical remote is `GeorgeMavroeidis/hleias-pulse`.

