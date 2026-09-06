# Hleias Pulse — Roadmap

> The ordered plan: what we're building, in what order, and how we know each
> stage is finished. **Not** auto-loaded — read it at the start of a session to
> know where things stand, and keep it current as work lands. The messy,
> unordered backlog and the open product/technical questions live in `IDEAS.md`;
> the security checklist lives in `SECURITY.md`.
>
> `v1 — 2026-09-06`. Drafted by the coding agent from the codebase and history.
> **The timeline, the billing model, and the order of "Next up" are product
> calls — Mavroeidis sets those, not the agent.** Everything marked ⚠️ is a
> placeholder waiting on that.

**Target:** ready for the 2027 tourist season in Ilia — the season runs roughly
April–October, so the app needs real content and a public build **by spring
2027**. ⚠️ *Set the exact date you're working back from.*

---

## Right now

**Stage 1 (REPAIR) is done. We're at the start of Stage 2 (BUILD).**

Current focus: **get a real build onto a real iPhone** (TestFlight). Almost
everything else in Stage 2 needs testers who aren't us, so this unblocks the
rest.

## Next up (ordered)

1. **First TestFlight build.** Open an Apple Developer account, produce a signed
   build, install it on a real device, invite 5–10 real testers.
2. **Confirm the web deploy works end to end.** `npm run deploy:worker` uploads
   to Cloudflare — nobody has verified the deployed site actually runs, only that
   the script exists.
3. **Story expiry.** Expired stories are still readable straight off the table
   (the 6h/24h cutoff lives only in `get_pulse_bootstrap()`, not the row-security
   policy) and nothing ever deletes them. Add the cutoff to the policy **and**
   decide a deletion schedule — this is user photos tied to a location, so EU
   privacy law applies. See `IDEAS.md` → Security.
4. **Decide the billing model** — flat monthly partnership fee vs. a cut per
   redeemed deal. This blocks the business-facing half of Stage 2 (onboarding
   flow, the owner's dashboard, what numbers it shows). ⚠️ *Your call.*
5. **Error tracking + rate limiting.** Error tracking (e.g. Sentry) so a crash in
   the wild is visible; rate limiting so a single account can't run up abuse or
   cost. Both are cheap now and expensive to retrofit under load.
6. **Test coverage for the untested modules** — `admin` (the whole
   owner/editor/moderator permission model), cultural events / organizers,
   business verification, routes. The admin surface is the sharpest gap: it's the
   one area with its own privilege-escalation path and nothing exercises it.

Keep this list to ~6. When something lands, tick it in the stage below and pull
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

Work: TestFlight build + Apple Developer account · confirm the web deploy ·
story expiry + retention · notifications (a reason to come back) · the
business-onboarding flow and the owner's redemption dashboard (gated on the
billing decision) · error tracking + rate limiting · fill the test-coverage
gaps · App Store compliance groundwork (privacy policy, data-use labels).

**Done when:**
- A first-time user in Pyrgos understands what the app is for within 30 seconds.
- Apple accepts a TestFlight build and real testers are using it.
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

- **Apple review** — days to weeks per submission, and a rejection restarts the
  clock. Submit the first TestFlight build early.
- **Real locals and real businesses** — weeks of conversations. No amount of
  engineering speed substitutes for this.
- **Database migrations** — each one needs explicit approval and goes in one at a
  time (see `CLAUDE.md` → Guardrails). Don't batch a stack of schema changes for
  the week before launch.

## Open decisions

- [ ] **Billing model** — flat monthly partnership fee vs. per-redemption cut.
      Blocks the business-facing Stage 2 work.
- [ ] **Web build** — keep it at full parity with iOS, or let it lag while Stage
      2 focuses on the app?
- [ ] **iOS identity** — the bundle id and display name are still
      `com.theodoros.iliapulse` / "Ilia Pulse". Rebrand to "Hleias Pulse", or
      keep the internal id and only change the visible name?
- [ ] **Community roles** — who owns business partnerships, content moderation,
      and community-building? Unassigned. Needs deciding before Stage 3.
