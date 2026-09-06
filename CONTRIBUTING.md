# Contributing to ΗΛΕΙΑ PULSE

## Who is who

Two people work in this repository and **both are called Giorgos**. Never infer from a
first name. Check whose session you are in before you edit anything:

```sh
git config user.email
```

| Email | Who | Lane |
|---|---|---|
| `128294142+GeorgeMavroeidis@users.noreply.github.com` | **Mavroeidis** (`@GeorgeMavroeidis`) | Data, map, security, infra |
| `giorgosmargaris1234@gmail.com` | **Margaris** (`@GeorgeMargaris`) | Product surface, UI, copy |

If that returns nothing, stop and set it. An unset identity produces commits attributed to
a machine-local address that GitHub cannot link to either account.

## Ownership lanes

[.github/CODEOWNERS](.github/CODEOWNERS) encodes the lanes and GitHub enforces them once
branch protection requires Code Owner review. [CLAUDE.md](CLAUDE.md) is the
human-readable version. In short:

- **Mavroeidis** owns `src/lib/**`, `supabase/**`, `scripts/**`, `.github/**`,
  `SocialMap.tsx`, `ImageBox.tsx`, `src/components/admin/**`, and build/deploy/Capacitor
  config.
- **Margaris** owns `src/components/hp/**` (except those two files), `src/components/ui/**`,
  `public/**`, and the two i18n files.

**Do not quietly edit the other lane, and do not work around it by duplicating logic on
your own side.** Say what you need and stop:

> "This needs a `reports` table and a `createReport()` in `hp-api.ts`. That is Mavroeidis's
> lane — I have not touched it. Here is the exact shape required: …"

A blocked task reported clearly is worth more than a merge conflict delivered quietly.

## Branch and Pull Request workflow

```sh
git fetch origin && git switch main && git pull --ff-only origin main
git switch -c <feat|fix|chore|docs>/<short-name>
```

- `main` is the only long-lived branch. **Never commit or push to it directly.**
- Small PRs, merged daily. A branch older than 48h is a merge conflict waiting to happen.
- Never force-push a shared branch.
- Do not merge your own Pull Request until the other collaborator has reviewed it.
- Delete the branch after merge.

## Required checks

CI runs all of these on every Pull Request. Run them locally first:

```sh
npm ci
npm run lint                 # 0 errors expected (3 known warnings)
npx tsc --noEmit
npm run build
npm run test:intelligence
npm run test:discovery
npm run test:map-visuals
```

Docs in this repository have been wrong before — `HANDOFF.md` claimed posting worked when
it did not. **Run the thing before reporting it works.**

## Changes that need the other person's approval

Ask **Mavroeidis** before:

- adding, changing or applying any Supabase migration
- changing `.gitignore`, deployment configuration, or deploying to production
- changing anything to do with auth, payments or security

Ask **Margaris** before changing a screen, sheet, component or user-facing copy.

Before planning a database change, read the existing migration history and
[docs/ARCHITECTURE-security.md](docs/ARCHITECTURE-security.md).

### One extra rule for migrations

Postgres ORs permissive RLS policies together, and `drop policy if exists` on a name that
does not exist is a **silent no-op**. A policy bug once survived two fix attempts that way.

So: **any PR that creates or drops a policy must state, in its description, how many
policies now exist per command per table it touches.** One line. It is the cheapest check
in this repository and it would have caught that bug both times.

## Secrets

- Never commit `.env`, `.env.local`, service-role keys, database passwords, or tokens.
- Browser code uses only the Supabase **publishable/anon** key. Service-role keys are
  server-only and must never enter frontend code.
- The Supabase project reference is not a secret and may appear in configuration.

**RLS is the only boundary this application has** — the `anon` role holds a blanket SELECT
grant from Supabase's default privileges, so nothing sits underneath a policy to catch a
mistake. Treat every policy change as a security change.
