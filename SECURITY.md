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

## Push-notification trust boundary

Push delivery has four layers with deliberately different authority:

1. An authenticated user may create a pending comment or manage only their own
   browser subscriptions. A database trigger—not the client—resolves the
   parent owner, moderation state, and either-direction blocks.
2. Moderation is the event boundary. Only the first transition of an answer
   from a non-published state to `published` creates an outbox event. Inserts,
   edits, hides, and replays do not send directly.
3. The queue lives in the `private` schema with RLS enabled and no grants to
   `anon`, `authenticated`, or `service_role`. The Edge Function can operate it
   only through three `SECURITY DEFINER` RPCs granted to `service_role`.
4. Cron calls the Edge Function with the public project key (only to cross the
   Supabase gateway) plus a separate 256-bit internal secret. The handler checks
   that secret with SHA-256 and timing-safe comparison before parsing a body or
   opening a database connection.

The HTTP interface is intentionally narrow: `POST`, JSON content type, and an
empty object no larger than 256 streamed bytes. It has no CORS response and no
`OPTIONS` path. Success is always a generic `202`; authentication and internal
errors do not reveal IDs, row existence, counts, endpoints, or library errors.

### Queue lifecycle and retries

An outbox event and each per-subscription delivery move through `queued`,
`processing`, then `sent`, `skipped`, or `failed`. Claims use
`FOR UPDATE SKIP LOCKED`, carry an unguessable claim token, and expire after
five minutes. A worker invocation claims at most 20 rows and sends at concurrency
five.

Only network/timeouts and HTTP 408, 425, 429, and 5xx are retried. Four total
attempts use 1-, 5-, and 30-minute backoffs. Other 4xx responses are permanent;
404/410 removes the dead subscription. The event is `sent` if any device
succeeds, `skipped` if it becomes ineligible or has no subscription, and
`failed` only when all device deliveries terminate without success.

Eligibility is checked again after the claim and immediately before transport:
the answer and question must still be published, ownership must still match,
the answer cannot be self-authored, and neither user may currently block the
other. Message text and endpoint material never enter the outbox tables; the
worker reads the current rows only after a valid claim.

### Outbound-request policy

Subscription endpoints are validated on database insert/update and again in
the worker. They must be HTTPS on the default/443 port, with no credentials,
fragment, IP literal, localhost name, trailing-dot name, redirect following, or
deceptive suffix. The only accepted hosts are:

- `fcm.googleapis.com`
- `updates.push.services.mozilla.com`
- a boundary-safe subdomain of `push.apple.com`

`web-push` generates the encrypted request and VAPID headers; `fetch` performs
the request with redirects disabled, a five-second abort, and an 8 KiB bounded
response read. A stable 32-character Web Push Topic reduces duplicates across
crash recovery. Exactly-once delivery is still impossible if a provider accepts
a request and the worker crashes before recording success.

Logs may contain only event/delivery IDs, provider category, attempt number, and
a fixed outcome code. Never log notification text, endpoint paths, keys,
headers, provider bodies, Vault values, or environment values.

## Push deployment and operations

Production changes require one explicit approval covering Function/Vault
secrets, Function deployment, `supabase db push`, and cron activation. A tested
PR is not that approval.

Before approval, perform read-only checks only: confirm `origin/main`, remote
migrations and function version/config, exact subscription hosts, the absence
or expected presence of the three Vault names, and queue/grant state. Never run
write-oriented smoke scripts against the linked live project.

After approval, use this order:

1. Set `PUSH_WORKER_APIKEY` locally to the project publishable key, then run
   `npm run provision:push-worker -- --apply`. It generates a 256-bit secret
   without printing it, writes the Function secret first, and parameterizes the
   matching Vault values `push_worker_url`, `push_worker_apikey`, and
   `push_worker_secret`.
2. Deploy `send-push` first with JWT verification enabled. The legacy trigger
   then fails the internal-secret check, deliberately pausing push while closing
   the public-call vulnerability.
3. Apply the migration. It removes direct delivery, creates the private queue,
   and schedules the once-per-minute job. Delivery resumes within a minute.
4. Verify a public-key call and a normal user-JWT call are rejected, an approved
   internal empty-queue call returns 202, the cron job is active, and grants/RLS
   match `supabase/policy-snapshot.json`. This verification must not create a
   real notification.

Observe counts by queue state, oldest due work, leases older than five minutes,
fixed failure categories, uniqueness violations, `cron.job_run_details`, and
`net._http_response`. Do not select or export endpoint values or content while
diagnosing delivery.

Rollback is a controlled pause: unschedule/pause the worker, preserve the
outbox, and forward-fix. Never restore the old insert trigger or the insecure
Function. Secret rotation follows the same safe pause: update the Function
secret, update Vault, verify an internal call, then resume cron. If Vault or any
required Function/VAPID value is absent, the system must fail closed without an
outbound request.

No historical answer is backfilled. Answers pending when the migration lands
enqueue only if approved afterward. Adding another push provider requires a
reviewed allowlist migration and endpoint-policy tests.

## Privacy (location data)
Location is personal data under EU/Greek privacy law (GDPR). Don't store more
precision than a feature actually needs, and think about retention — do old
location pings need to be kept at all, or just the current one?

## Pre-launch security checklist
One pass, all in one place, before opening this to real outside users:
- [ ] Full RLS audit across every table — not spot-checks
- [ ] Secrets scan clean
- [ ] Push worker secret, Vault names, JWT verification, and cron preflight pass
- [ ] `npm run test:push-security` and `npm run smoke:push-security` pass
- [ ] Deals redemption re-verified against reuse/replay (already smoke-tested —
      confirm again right before launch, not just once during development)
- [ ] Rate limiting in place *(see IDEAS.md — not built yet)*
- [ ] Error tracking set up *(see IDEAS.md — not built yet)*
