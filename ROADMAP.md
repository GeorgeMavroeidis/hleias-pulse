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
2027**. ⚠️ _Set the exact date you're working back from._

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

## Appearance and reliability integration

The [final design review](docs/final-design-review.md) and
[GitHub inventory #105](https://github.com/GeorgeMavroeidis/hleias-pulse/issues/105)
now compare current main, assembled #100 (including #103), and the shared
`margaris/trip-map-pulse` implementation. Existing PRs are grouped and retain
their dependency chain. Place Directions / Οδηγίες is prepared as a focused
follow-on to #100. The final visual choice, combined release acceptance and
human main merges remain open.

The simpler composer (#101) and app-wide Light / Dark / System preferences (#102)
are merged into main. Appearance remains device-local; live publication is deferred.

The existing reliability and map-design PRs are being consolidated in order,
preserving those changes. The final integration combines explicit place selection,
Athens Meet-time validation, comment drafts, recovery and shared freshness, compact
markers, Pulse / Calm motion, discovery sheets and a single appearance/atmosphere
map palette. Dark stays navy across time periods; Light retains its temporal colors.

See [the integration handoff](docs/reliability-integration.md) for branch/worktree
contents and the merge procedure. Combined acceptance is required before human
merges. Account redesign and Trip implementation remain separate work; hosted
database changes, deployment and historical-worktree cleanup are deferred.

The [final marker pass](docs/final-map-markers.md) is prepared on a separate
branch above the latest discovery integration: ordinary dots, selected/focused
place photos and clean dot fallback. Focused browser acceptance is complete;
review and human integration remain. No further map redesign is queued.

## Proposed direction — sell the app to a public body · ⚠️ not yet agreed

> Proposed by Margaris on `2026-10-29`. **This changes where the project is
> going, so it needs Mavroeidis's agreement before it changes anything below.**
> Until then, "Next up" and the stages stand as written.

**The proposal.** Instead of earning from businesses (Deals commission or
subscription), sell **100% ownership** of the app to a public body: the
Region of Western Greece (Περιφέρεια Δυτικής Ελλάδας) or the Municipality of
Pyrgos. Who maintains it after the sale is still open.

**What a sale needs, whoever the buyer is:**

1. **Written agreement between the owners first.** Both maintainers (and anyone
   else who contributed, e.g. the pitch-deck author) agree to sell and on how
   the money is split. Nothing else is worth doing before this.
2. **Clean title to everything being sold.** Find out whose name each account
   is in (Supabase, Cloudflare, domain, Apple Developer; the iOS bundle id is
   still `com.theodoros.iliapulse`); confirm every photo and piece of content
   is ours or licensed; check the licences of what we build on.
3. **A legal entity that can invoice the public sector.** Tax registration or a
   company, tax/social-security clearance certificates, e-invoicing. Costs
   money, so it falls after the February 2027 budget gate. Confirm with an
   accountant: the direct-award ceiling (believed to be ~€30k excl. VAT; above
   it means a public tender) and how a one-off sale is taxed.
4. **A price grounded in something real.** Rough quotes from 2–3 software
   agencies for building the equivalent app, which is what the buyer will
   compare us against.
5. **A clear maintenance answer.** "We'll see" will lose the sale. Offer two
   options: (A) full handover with written docs and admin training, or (B) sale
   plus a separate, cancellable maintenance contract. Someone must also
   moderate user posts. After the sale, the owner is responsible for them.
6. **Proof of use.** The Pyrgos pilot (50–100 locals, 10–20 businesses) is what
   turns "an app" into "an app people here use". A sale before it has little
   to show.

**What desk research found (`2026-10-29`; a few searches, not exhaustive).**

- **The Region already owns a similar app: VisitOlympia**
  (`visit-olympia.gr`, App Store + Google Play). It was funded by ESPA 2014–2020
  and launched January 2023. It has a map, routes, events, a business directory
  and user contributions. **It looks abandoned:** the newest news item is
  February 2024, the events list is empty, and the business directory still
  holds a placeholder ("Τίτλος επιχείρησης 1", lorem ipsum). It cuts both ways:
  the Region can say "we already have one", but it is also the strongest proof
  that a guide nobody keeps updated dies. That is the problem a locals-fed app
  solves, **provided the maintenance question has an answer**.
- **National level:** the Ministry of Tourism is redesigning `visitgreece.gr`
  (six languages, AI-adapted), per pelop.gr, February 2026.
- **Municipality of Pyrgos:** a **Tourism Committee** has met since July 2025,
  chaired by Deputy Mayor for Tourism Alekos Galanopoulos, with hoteliers,
  traders, taxis and the Municipal Port Fund. A consultancy (Wise Ram) is
  drafting a Strategic Tourism Development Plan with the Port Fund (Katakolo /
  cruise passengers). Nothing published mentions an app, but they are planning
  right now, and there is a named person to approach. Pyrgos already uses
  `sense.city` (residents reporting problems), so it has adopted an app
  before.
- **Funding:** the "Δυτική Ελλάδα 2021–2027" programme is ~€628M, with
  tourism/culture a priority area and projects tying tourism to "digital
  experiences" funded in July 2026. **No open call for digital tourism for
  municipalities was found.** Check `dytikiellada.gr` and Διαύγεια.

**Agent's read (for discussion, not a decision):** the Region looks like an
unlikely buyer for 100% of the app as it stands. It already owns VisitOlympia,
the app covers one of its three regional units (Ilia, not Achaia or
Aitoloakarnania), and user-generated posts plus deals for private businesses
are liability a public body may not want. The Municipality of Pyrgos, via its
Tourism Committee, looks like the more realistic first conversation.

**Cheap first steps (no spending):** try VisitOlympia for 15 minutes and list
what's broken, which becomes a pitch slide · approach the Pyrgos Tourism
Committee with the pilot as a free partnership, not a sale · in meetings, ask
what they're trying to fix in tourism before presenting anything.

## Proposed direction — a social app about what's happening now · ⚠️ not yet agreed

> Proposed `2026-11-07`. **It changes what Stage 2 builds, so it needs
> Mavroeidis's agreement before it changes anything below.** Until then, "Next
> up" and the stages stand as written. The pull request that added this section
> has the full plan.

**The idea.** Make the app the place to see what is happening near you right
now, and give locals a reason to post it; not a travel planner. The loop:
_see something → tap the camera → it is on the map in seconds → people see it →
you see that they saw it → you come back tomorrow._ That is Stage 2's objective
("worth opening a second time") and Stage 3's done-when ("50–100 locals posting
without being asked"), made concrete.

**What stops it today** (checked in the code, `2026-11-07`):

1. **Nobody can post their own photo.** `createPulsePost` and
   `createPulseStory` attach the place's stock photo, the composer has no camera
   or file input, and `content-media` accepts uploads only from admins,
   organizers and businesses.
2. **New content is invisible until approved.** The insert policies force
   `moderation_status = 'pending'` on posts, comments, places, stories and Meets
   (`20260904120000`), and public reads require `published`.
3. **Posting is buried.** The general "+" is on Pulse only, and a story takes
   about five taps through the five-mode composer.
4. **No reward for posting.** Authors cannot see how many people viewed their
   story, the posting streak sits in the profile sheet, and push is not
   deployed.
5. **Cold start.** The live database has 8 posts, all from August, and 0
   stories.

**Decisions it needs** (also under Open decisions; each schema change is its
own approved migration):

- **D1 — approve first, or publish instantly?** Proposed: trusted after one
  approved post. A new account's first post waits for a moderator; after that
  its posts go live at once. Verified businesses, organizers and the team are
  trusted from the start. Three reports from different users hide an item until
  a moderator looks. The server sets the status, never the client. _Schema:_
  insert trigger plus policy changes, reviewed against the push design (answers
  notify on their first move to `published`).
- **D2 — photos for everyone.** Proposed: each user uploads only into their own
  folder (`user-media/<uid>/`); the phone shrinks photos to ~1080 px JPEG
  (~200 KB) plus a thumbnail, which also strips their GPS metadata; story media
  is deleted 7 days after expiry, which answers Next up #1's retention question.
  No video on the free plan. _Schema:_ storage policy plus a scheduled clean-up.
- **D3 — the centre button.** Proposed: the camera. Where Trip goes is
  Margaris's call; one option is Trip and Routes sharing a tab. _Schema:_ none.
- **D4 — story view counts.** Proposed: a count kept by a trigger, like
  `going_count`; never who viewed. _Schema:_ column plus trigger.
- **D5 — story-for-a-deal.** Proposed: a verified business can require a
  published story at its place today before `issue_deal_code` issues a code.
  _Schema:_ function change plus smoke tests.
- **D6 — a 6 PM digest.** Proposed: opt-in, by `home_area` (no GPS), sent only
  when something is on. Needs the push deployment approval in `SECURITY.md`;
  iPhones get it only via Add to Home Screen until the App Store app.
  _Schema:_ new event type plus a schedule.
- **Also:** who applies approved migrations to the live database?

**Order.** (1) "Τώρα κοντά σου": with location already allowed, the map opens
on your area and shows live stories and tonight's events; Pulse opens with the
newest posts. No schema change, so it is being built first, on the `tedprod`
preview. (2) Post a photo story in two taps (D1–D3). (3) Being seen: view
counts, top story tonight per area, "Local · Πύργος" from `home_area`, the
streak on the camera button (D4). (4) Businesses and organizers post first,
and story-for-a-deal (D5); recruiting them is the real cold-start fix. (5) The
6 PM digest (D6). Later: ranking, which is pointless at 8 posts, and an AI
moderator, after February 2027 or on a free tier.

**How it meets the sale proposal above.** A locals-fed app answers why
VisitOlympia died (nobody kept it updated), which strengthens that pitch. But
open posting is also moderation liability a public buyer would inherit, so D1
and the "Community roles" decision matter more under a sale, not less.

**Already built:** a full-screen photo map, on the `tedprod` branch only (not
merged). Its commit message lists the test rules it changes on purpose: photos
on up to 12 markers, village labels from zoom 10.5, one-language town names.

## Right now

**Stage 1 (REPAIR) is done. We're in Stage 2 (BUILD).**

Current focus (Oct 2026 – Jan 2027): **the free work** — code, tests, and
free-tier services. The paid/Apple track starts in February.

## Next up (ordered) — free work first

1. **Story expiry** — _read-side closed (2026-09-07)._ The 6h/24h cutoff used
   to live only in `get_pulse_bootstrap()`, not the row-security policy —
   anyone with the public API key could read a story straight off the table
   after it "expired" in the UI. `20260907140000_enforce_story_expiry_rls.sql`
   moved the same check into the policy itself; applied to the live database.
   **Still open, and it's a product call, not an engineering one:** nothing
   deletes expired rows (or their media in the `content-media` Storage
   bucket) — this stops them being _read_, not stores them forever. Needs a
   retention-period decision before a deletion job is worth building. See
   `IDEAS.md` → Security, and → Architecture / Tech Debt for the migration
   drift this uncovered.
2. **Test coverage for the untested modules** — _mostly done (2026-09-07)._
   `smoke:admin` now covers the whole owner/editor/moderator permission model,
   including the privilege-escalation path; `smoke:verification-guards` covers
   organizer and business self-verification; `smoke:routes` covers routes /
   route stops. `saved_items` now has a disposable local-stack smoke covering
   the app's save/load path and per-user isolation. Left: cultural-event
   publishing and place claims.
   Pure code, no migration, no cost. That pass also turned up an audit-trail
   gap — **closed 2026-09-07**: `businesses`, `organizers` and `admin_members`
   now carry audit triggers (`20260907120000`, applied live), and the admin API
   no longer reports a refused write as a success. The decision it left you is
   now made: an audit row **keeps** naming its actor after that person deletes
   their account — `20260907170000` drops the foreign key that was nulling it.
   That migration is **written but not yet applied to the live database**, so
   production still anonymises on deletion until someone pushes it. The
   retention _period_ is still unset; see `IDEAS.md` → Security for both. The
   `/admin` activity panel now shows who performed each action, not just what
   changed. Also from that pass, a CI blind spot, now closed: `tsconfig.json` only ever covered `src/**`, so neither `scripts/**`
   nor `cloudflare-static-src/**` (the production entry) was typechecked.
   There are now two projects and a `npm run typecheck` that runs both.
   And it turned up the fault behind the four leaked test accounts: a dropped
   pooled connection is an unhandled `error` event, which kills the process
   _outside_ `try/finally`, so cleanup never runs. Fixed in three scripts by
   hand, which left it live in the other five — every `pg` script now shares
   one guarded connection helper (`scripts/lib/pg.ts`) instead of eight
   hand-copied ones. Left over: `smoke:admin`, `smoke:routes` and
   `smoke:verification-guards` still carry their own copy of that block.
3. **Confirm the web deploy works end to end** — _build artifact verified
   (2026-09-07), actual live Cloudflare deploy still unverified._ Built
   `cloudflare-static-dist` fresh off `main` and served it through
   `wrangler dev` (the same static-assets + SPA-fallback runtime Cloudflare
   uses, no account needed to run it locally): onboarding, map, Pulse feed,
   story viewer and the `/admin` gate all loaded correctly, and — worth
   calling out — `/admin` returned 200 (not a 404) confirming the SPA
   fallback the `window.location.pathname` check depends on actually works
   under Cloudflare-style routing, not just `vite dev`. Only console noise:
   expected, already-handled CORS failures from `image-cache.ts`'s optional
   thumbnail cache hitting external hosts with no CORS headers (pravatar,
   municipal tourism sites) — it degrades to the plain image URL by design,
   confirmed still rendering fine. **What's left:** nobody has run
   `npm run deploy:worker` against the real Cloudflare account or checked the
   live `*.workers.dev` URL — needs whoever holds that account.
4. **Error tracking + rate limiting.** Error tracking on a free tier (e.g. Sentry
   ~5k errors/month free) so a crash in the wild is visible; rate limiting at the
   app or database layer (no paid service needed) so one account can't run up
   abuse or cost.
5. **Web push notifications.** The browser subscription UI exists, and Phase 0
   hardening adds moderation-gated durable delivery, push-time block checks, a
   strict provider allowlist, bounded transport, and disposable-stack coverage. It
   remains intentionally undeployed until the security PR is merged and the
   production provisioning/deploy approval in `SECURITY.md` is given. Native
   APNs/TestFlight work still waits for the paid Developer account.
6. ⏸ **First TestFlight build** — _blocked until February_ (needs the paid Apple
   Developer account). Everything else that can be done without it should be done
   by then: build config, app icons, privacy-policy text, App Store copy.
7. ⏸ **Decide the billing model** — flat monthly fee vs. per-redemption cut.
   Doesn't block the free work; needed before the business dashboard. ⚠️ _Your
   call, any time._

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
- Apple accepts a TestFlight build and real testers are using it. _(Feb+)_
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

- [ ] **Sell the app to a public body?** Proposed `2026-10-29`. See
      "Proposed direction — sell the app to a public body" above. Needs both
      maintainers' agreement. If agreed, it replaces the billing-model question
      below.
- [ ] **A social app about what's happening now?** Proposed `2026-11-07`. See
      "Proposed direction — a social app" above. Needs Mavroeidis's agreement;
      if agreed, six smaller decisions follow (D1–D6): publish instantly vs.
      approve first · photos for everyone · the centre button · story view
      counts · story-for-a-deal · a 6 PM digest.
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
