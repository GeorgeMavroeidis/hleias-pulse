# Hleias Pulse — Roadmap

> The ordered plan: what we're building, in what order, and how we know each
> stage is finished. **Not** auto-loaded — read it at the start of a session to
> know where things stand, and keep it current as work lands. The messy,
> unordered backlog and the open product/technical questions live in `IDEAS.md`;
> the security checklist lives in `SECURITY.md`.
>
> `v1 — 2026-09-06`, budget constraint added `2026-09-07`. Drafted by the coding
> agent from the codebase and history. **The timeline, the billing model, and
> the order of "Next up" are product calls — Mavroeidis sets those, not the
> agent.** Everything marked ⚠️ is a placeholder waiting on that.

**Target:** ready for the 2027 tourist season in Ilia — the season runs roughly
April–October, so the app needs real content and a public build **by spring
2027**. ⚠️ *Set the exact date you're working back from.*

## Budget constraint — no spending until February 2027

**Nothing that costs money happens before February 2027.** That includes:
- the **Apple Developer Program** (~€99/year — unavoidable to put the app on
  iPhones, TestFlight included),
- any **paid tier** of a hosting, database, monitoring, or push service,
- paid fonts, assets, domains.

Until February we use **free tiers only** and do work that costs nothing. The
paid items below are marked ⏸ and parked behind this gate — they are not
cancelled, just deferred.

**Timeline risk to be aware of (Mavroeidis's call, not the agent's):** the Apple
side — Developer account approval, first signed build, a TestFlight round, then
App Store review — realistically needs **6–10 weeks** from a standing start. If
paid work begins in February and the season target is spring 2027, that path is
tight. Options: accept a later-in-season launch, find the ~€99 sooner, or ship
the web build first and the iOS app during the season.

---

## Right now

**Stage 1 (REPAIR) is done. We're in Stage 2 (BUILD).**

Current focus (Oct 2026 – Jan 2027): **the free work** — code, tests, and
free-tier services. The paid/Apple track starts in February.

## Next up (ordered) — free work first

1. **Story expiry** — *read-side closed (2026-09-07).* The 6h/24h cutoff used
   to live only in `get_pulse_bootstrap()`, not the row-security policy —
   anyone with the public API key could read a story straight off the table
   after it "expired" in the UI. `20260907140000_enforce_story_expiry_rls.sql`
   moved the same check into the policy itself; applied to the live database.
   **Still open, and it's a product call, not an engineering one:** nothing
   deletes expired rows (or their media in the `content-media` Storage
   bucket) — this stops them being *read*, not stores them forever. Needs a
   retention-period decision before a deletion job is worth building. See
   `IDEAS.md` → Security.
2. **Test coverage for the untested modules** — *mostly done (2026-09-07).*
   `smoke:admin` now covers the whole owner/editor/moderator permission model,
   including the privilege-escalation path; `smoke:verification-guards` covers
   organizer and business self-verification; `smoke:routes` covers routes /
   route stops. Left: cultural-event publishing, place claims, `saved_items`.
   Pure code, no migration, no cost. That pass also turned up an audit-trail
   gap — **closed 2026-09-07**: `businesses`, `organizers` and `admin_members`
   now carry audit triggers (`20260907120000`, applied live), and the admin API
   no longer reports a refused write as a success. One decision left for you,
   in `IDEAS.md` → Security: whether an audit row should keep naming its actor
   after that person deletes their account. Also from that pass, a CI blind
   spot, now
   closed: `tsconfig.json` only ever covered `src/**`, so neither `scripts/**`
   nor `cloudflare-static-src/**` (the production entry) was typechecked.
   There are now two projects and a `npm run typecheck` that runs both.
   And it turned up the fault behind the four leaked test accounts: a dropped
   pooled connection is an unhandled `error` event, which kills the process
   *outside* `try/finally`, so cleanup never runs. Fixed in three scripts by
   hand, which left it live in the other five — every `pg` script now shares
   one guarded connection helper (`scripts/lib/pg.ts`) instead of eight
   hand-copied ones. Left over: `smoke:admin`, `smoke:routes` and
   `smoke:verification-guards` still carry their own copy of that block.
3. **Confirm the web deploy works end to end.** `npm run deploy:worker` uploads
   to Cloudflare (free tier) — nobody has verified the deployed site actually
   runs, only that the script exists. May need a free Cloudflare account first.
4. **Error tracking + rate limiting.** Error tracking on a free tier (e.g. Sentry
   ~5k errors/month free) so a crash in the wild is visible; rate limiting at the
   app or database layer (no paid service needed) so one account can't run up
   abuse or cost.
5. **Web push notifications.** A reason to come back. Web push is free; Apple push
   (APNs) needs the Developer account, so that half is ⏸ until February.
6. ⏸ **First TestFlight build** — *blocked until February* (needs the paid Apple
   Developer account). Everything else that can be done without it should be done
   by then: build config, app icons, privacy-policy text, App Store copy.
7. ⏸ **Decide the billing model** — flat monthly fee vs. per-redemption cut.
   Doesn't block the free work; needed before the business dashboard. ⚠️ *Your
   call, any time.*

Keep this list to ~6–7. When something lands, tick it in the stage below and pull
the next item up from `IDEAS.md`.

---

## The three stages

### Stage 1 — REPAIR · ✅ done

**Objective:** the app actually works, end to end, for someone who isn't on the
team.

**Done when — all true now:**
- Core loop verified against the live database (sign up → post → see it → redeem
  a deal → block someone).
- CI runs on every PR and `main` is protected (checks must pass to merge).
- `PulseApp.tsx` split from ~7k lines into a shell plus per-screen files.
- Report / block / mute is wired to Supabase, enforced by row-security on the
  server (not just hidden in the UI), and covered by `smoke:moderation` so it
  can't silently regress.
- Every write path requires a real account; there is no anonymous fallback.
- An RLS policy-snapshot regression gate + a committed-secret scan run in CI.

### Stage 2 — BUILD · ⬜ now

**Objective:** make it worth opening a second time.

Split by the budget gate:

- **Oct 2026 – Jan 2027 (free):** story expiry + retention · test-coverage gaps ·
  confirm the web deploy (free tier) · error tracking + rate limiting on free
  tiers · web push notifications · App Store groundwork that costs nothing
  (privacy-policy text, icons, store copy) · start recruiting locals (Stage 3
  work, but the lead time is long).
- **Feb 2027 onward (paid unlocked):** Apple Developer account · first TestFlight
  build + real testers · Apple push notifications · the business-onboarding flow
  and owner's dashboard (also needs the billing decision).

**Done when:**
- A first-time user in Pyrgos understands what the app is for within 30 seconds.
- Apple accepts a TestFlight build and real testers are using it. *(Feb+)*
- A real café or shop owner has run a real deal redemption, start to finish.
- Story expiry and moderation are trustworthy — expired content is gone, a
  reported item reaches a moderator, a block actually holds.
- A crash in the wild shows up somewhere we look.

### Stage 3 — DEPLOY · ⬜ before the season

**Objective:** an empty map is worth nothing — fill it before tourists arrive.

Work: recruit locals to post real content · sign up partner businesses with real
deals · App Store submission and launch · monitoring and alerts so an outage
is noticed.

**Done when:**
- 50–100 locals are posting without being asked to.
- 10–20 partner businesses have live deals.
- The app is on the App Store.
- The map shows content nobody on the team created.

**Start recruiting locals and businesses during Stage 2, not after it.** Outreach
is slow and can't be compressed near the deadline.

---

## What a deadline can't compress

- **The February budget gate** — no Apple Developer account, no paid services
  before then. Everything on the paid track starts in February at the earliest.
- **Apple review** — days to weeks per submission, and a rejection restarts the
  clock. Once the account exists, submit the first TestFlight build immediately.
- **Real locals and real businesses** — weeks of conversations. No amount of
  engineering speed substitutes for this. This is why recruiting starts now, not
  after the app is done.
- **Database migrations** — each one needs explicit approval and goes in one at a
  time (see `CLAUDE.md` → Guardrails). Don't batch a stack of schema changes for
  the week before launch.

## Open decisions

- [ ] **Billing model** — flat monthly partnership fee vs. per-redemption cut.
      Blocks the business-facing Stage 2 work.
- [ ] **Web build** — the budget gate makes it the near-term focus by default
      (it can ship on free hosting now; the iOS app can't). Confirm that's the
      intent, and decide whether it stays at full feature parity once the iOS
      track opens in February.
- [ ] **iOS identity** — the bundle id and display name are still
      `com.theodoros.iliapulse` / "Ilia Pulse". Rebrand to "Hleias Pulse", or
      keep the internal id and only change the visible name?
- [ ] **Community roles** — who owns business partnerships, content moderation,
      and community-building? Unassigned. Needs deciding before Stage 3.
