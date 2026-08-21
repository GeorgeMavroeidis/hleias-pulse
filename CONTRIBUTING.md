# Contributing to ΗΛΕΙΑ PULSE

## Branch and Pull Request workflow

1. Start from the latest shared branch:

   ```powershell
   git switch main
   git pull origin main
   ```

2. Create a focused branch, for example `fix-map-popup` or `add-password-reset`.
3. Make small, clearly described commits.
4. Push the branch and open a Pull Request into `main`.
5. Do not merge your own Pull Request until the other collaborator has reviewed it.

Never commit or push directly to `main`. Never force-push a shared branch.

## Required checks

Before opening a Pull Request, run:

```powershell
npm ci
npm run lint
npm run build
```

## Protected changes

Ask Giorgos before changing any of the following:

- files in `supabase/migrations/`
- `.gitignore`
- production deployment configuration or deploying to production
- merging into `main`

Before planning a database change, read the existing migration history and `SUPABASE_BACKEND_PLAN.md`. Those files describe historical implementation context, not the current GitHub ownership or setup.

## Secrets and Supabase

- Never commit `.env`, `.env.local`, service-role keys, database passwords, or other credentials.
- The Supabase project reference may be used in configuration; it is not a secret.
- Browser code must use only the publishable/anon key. Service-role keys are server-only and must never enter frontend code.

