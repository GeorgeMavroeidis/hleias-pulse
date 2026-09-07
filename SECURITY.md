# SECURITY.md

> Reference this explicitly during a security pass — not auto-loaded every
> session like CLAUDE.md. The non-negotiable rules still live in CLAUDE.md's
> Guardrails section (so Claude Code never misses them); this file is the
> fuller picture behind those rules.

## Row Level Security (RLS)
Every table needs an RLS policy before it ships. A table without one is
readable/writable by anyone holding your public API key — effectively everyone.
`npm run audit:rls` already checks this. Run it before every deploy, not once
and forget it.

## Secrets
`npm run check:secrets` scans for leaked credentials. Run before every deploy.

## Privacy (location data)
Location is personal data under EU/Greek privacy law (GDPR). Don't store more
precision than a feature actually needs, and think about retention — do old
location pings need to be kept at all, or just the current one?

## Pre-launch security checklist
One pass, all in one place, before opening this to real outside users:
- [ ] Full RLS audit across every table — not spot-checks
- [ ] Secrets scan clean
- [ ] Deals redemption re-verified against reuse/replay (already smoke-tested —
      confirm again right before launch, not just once during development)
- [ ] Rate limiting in place *(see IDEAS.md — not built yet)*
- [ ] Error tracking set up *(see IDEAS.md — not built yet)*
