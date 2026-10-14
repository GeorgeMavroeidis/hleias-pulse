# Stay Pack — a plan for the tourist who has 7–10 days

> Status: **idea + plan, nothing built.** Written 2026-10-11 after a product
> discussion. Everything below is a proposal for both maintainers to react to
> before any schema or code is touched. Facts about the shipped app were checked
> against the code; facts about ferries, roads and prices are deliberately _not_
> stated here — they are content the team must verify.

## The idea in one paragraph

A tourist stays about a week. They will probably never come back and do not want
to browse "interesting things" — they want to **not get stuck**: how do I get to
the island, which road is closed, what is worth seeing, what should I avoid. The
Stay Pack is the part of Pulse that answers that, and then turns it into a
**game**: tell the app how many days you have, and either take a ready-made
itinerary or build your own by picking from short summaries of what locals and
the team have posted. Locals feed it and are rewarded; tourists are rewarded
for using deals and for feeding back to us.

## Who does what

| Who            | Does                                                                                            | Gets                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Team (us)**  | Writes and keeps up to date the **Essentials** (see below) and a first set of ready-made routes | A product that is useful on day 1, before any local has posted              |
| **Locals**     | Add places, tips, routes, and corrections                                                       | Earned **Guide** title; deals/perks from partner businesses (open question) |
| **Tourists**   | Pick days, build or take a trip, redeem deals, rate us                                          | Deals, stamps, a trip they can keep; small rewards for feedback             |
| **Businesses** | Publish deals (already built)                                                                   | Customers who can be counted — see the revenue notes in `IDEAS.md`          |

## The four pieces

### 1. Essentials — "what you need so you don't suffer"

A small, always-reachable set of cards, written and **verified by the team**
(not open to anyone to edit — a wrong ferry time costs a real person a real day).

Suggested sections, to be filled by the team:

- **Getting here and around** — ports and ferries, airports, car vs. taxi vs.
  bus, parking, driving conditions
- **Roads** — known bad or closed roads, seasonal warnings
- **What to see** — links into existing places and routes, not a second copy
- **What to watch out for** — heat, fires, sea conditions, scams, closed times
- **Emergencies** — numbers, nearest hospital/pharmacy by area

Rules that matter:

- Every card has a **"last checked" date** and an owner. A card older than a
  threshold shows a warning instead of looking current.
- Prefer a **link to the official source** over copying a timetable. Copied
  timetables go stale silently.
- Must work with **poor signal** — tourists roam abroad. Cache the Essentials
  in the app (the iOS shell is Capacitor; the web build can use a service
  worker). This is a real requirement, not polish.

### 2. Summaries of everything we have

The trip builder is only fun if choosing is quick. So every place, route and
notable post needs a **2-line summary card**: what it is, how long it takes,
who it suits, rough cost, season.

- `places` already has a `short` field — start there.
- Write summaries by hand (team + locals) first. **Do not add AI-generated
  summaries yet**: it is a paid API call per item, and `ROADMAP.md` says no
  spending before February 2027.

### 3. Trip builder — "plan my N days"

Flow (all steps skippable, nothing to type):

1. **How many days?** (and optionally: arriving by ship/car, base area, what you
   like — beach, history, food, kids). A few taps, no account needed to look.
2. The app lays out **empty day slots** and suggests a first fill from existing
   routes and places.
3. Two ways to continue:
   - **Take a ready-made route** (existing `routes` + `route_stops`), dropped
     into the days as-is.
   - **Build it yourself**: swipe through summary cards — _keep_ / _skip_ — and
     kept cards drop into days; drag to reorder; the app shows the drive/walk
     gap between stops and warns about an overloaded day.
4. The result is a **Trip card** the user can open each morning ("Day 3 — 4
   stops") and tick off.

Why it can feel like a game, with no new mechanics invented yet:

- progress ("5 of 7 days planned"), a deck of cards to swipe
- visiting a stop **stamps** it — `user_place_visits` already exists
- finishing a route or a trip unlocks something (a deal, a badge)

Keep the first version **small and local**: store the trip on the device only,
no database change, and see whether people actually enjoy it before building
storage. (See phases.)

### 4. Rewards — who earns what

- **Tourists** earn from: redeeming deals (built), finishing stops/trips,
  and **leaving feedback about Pulse itself** (a short rating/comment gives a
  small reward — assumption: "reward" is what was meant by the typo'd
  "επιβραδεύουμε" in the discussion; confirm). Reward = deal, badge, or
  priority access; **not cash**, which would drag in payments (a guardrail).
- **Locals** earn from: tips that other people save or find helpful →
  earned **Guide** title, plus perks from partner businesses. What exactly the
  perk is, and who pays for it, is an open question.
- Watch the incentive: rewarding _posting_ invites spam; reward being
  **useful** (saves, "helpful" marks), and let moderation (already built) act.

### Titles and "how much of Ilia have you discovered"

Added 2026-10-11. Both are **derived from what a person does**, never picked:

- **Titles** — earned, shown on the profile and next to a name (e.g. a first
  route finished, a beach-hopper, a night-owl, "Guide" for locals whose tips are
  saved). The list of titles and what earns each is still to be invented.
- **Discovery %** — "you have discovered 34% of Ilia". It needs a clear
  denominator, so decide early: share of **places** visited, or of **areas/
  villages**, or weighted per category (beaches, sights, food, villages)? Each
  verified visit is already recordable via `user_place_visits`. It is also the
  natural per-region number once other regions exist (a % per region).
- **Honesty about cheating:** a visit that is only a tap can be faked from the
  sofa. Options: count a visit only after a deal redeemed there or a
  stamp, or only with a coarse "I'm nearby" check. Remember location precision
  is personal data (GDPR) — store the visit, not a track of where someone was.
- **Points and levels** are being considered (decision pending). If they come,
  they should sit on top of the same events (visit, route finished, deal used,
  helpful tip) so there is one source of truth, and rewards are things like
  deals, badges and early access — not cash.

## The day and the hour matter

Added 2026-10-14 after the first local tests. A plan is only real if it respects time:
you cannot visit a museum at 07:00, watch the sunset at noon, or go to a museum on its
closing day. What we have today and what we need:

| Rule                                                            | What it needs                                             | Do we have it?                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Sunset places only around sunset                                | Sunset time for that date and spot                        | **Yes, can be computed** from latitude, longitude and date (no data entry) |
| Beaches in daylight, nightlife in the evening                   | A time window per kind of place                           | **Yes, as a soft hint** by place type (editable)                           |
| Museums and archaeological sites: opening hours and closed days | Verified weekly hours per place, with a source and a date | **No.** Only a free-text "best time" exists. Must be collected by the team |
| Seasonal changes (summer vs. winter hours, holidays)            | The same, per season                                      | **No**                                                                     |

Rules we keep: never invent opening hours; show "hours not confirmed — check before
you go" when we do not know; a place with verified hours is the only one the planner
will refuse to put on a closed day or outside its hours. The list of places that need
hours is in `docs/ESSENTIALS_CONTENT_CHECKLIST.md`.

## Built to travel: other regions later

The owner may take Pulse beyond Ilia (neighbouring prefectures, maybe all of
Greece). The cheap time to make that possible is **now**:

- Give content a **`region`** (Ilia is the first). Essentials, places, routes
  and trips belong to a region; the app opens on the region you are in or pick.
- Don't hard-code "Ilia" strings, ports or area lists in components.
- Don't build region management UI yet — just make sure a column exists when the
  tables are designed, because adding it after thousands of rows is the painful
  version.

## What exists today we can reuse (checked in the repo)

- `routes` + `route_stops` (public read, admin-only write) and `RoutesScreen.tsx`
  with an active step-by-step guide
- `places` with a `short` summary, `user_place_visits` (visit tracking)
- Saved items, Deals + QR codes, verified businesses
- Moderation (report/block/mute) and the `/admin` workspace
- Push notifications (a trip reminder is a natural later use)

What does **not** exist: any Essentials content, any trip/plan concept, region
scoping, offline caching, tourist feedback collection, any reward mechanic
beyond deals.

## Phases (each one shippable on its own; none needs paid services)

| Phase | What                                                                                          | Needs DB change? | Roughly |
| ----- | --------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 0     | **Content, no code:** team writes Essentials + 2-line summaries for existing places/routes    | no               | ongoing |
| 1     | **Essentials screen**, cached for offline, each card with "last checked"                      | small (a table)  | ~1 wk   |
| 2     | **Trip builder, device-only:** days picker, ready-made route import, swipe-to-pick, Trip card | no               | ~1–2 wk |
| 3     | **Save trips to the account** (so they survive a phone change; share with a friend)           | yes (RLS-owned)  | ~1 wk   |
| 4     | **Rewards:** stamps → deals/badges; feedback-for-reward; Guide title from helpful tips        | yes              | ~2 wk   |

Phase 2 before 3 is deliberate: **find out if it is fun before building storage
for it.**

### Sketch of the tables (Phases 1 and 3) — for discussion, not a spec

- `essentials` — region, section, title, body, source_url, last_checked_at,
  owner (admin write only, public read)
- `trips` — user_id, region, days, title, created_at (owner-only via RLS)
- `trip_items` — trip*id, day, position, place_id \_or* route_id (owner-only)

Every new table needs RLS before it ships (`npm run audit:rls`). Trips reveal
where someone will be on which day, so they are **private by default**, with
sharing as an explicit act.

## Open questions for the two of us

1. **Who owns Essentials content** and keeps it fresh? An unowned info page is
   worse than none. (Same unassigned-ownership problem as in `IDEAS.md` → Open
   Questions.)
2. **What exactly is the reward** for locals, and who pays for it? Deals from
   partner businesses are the only reward that costs us nothing today.
3. **Languages.** Tourists are mostly not Greek speakers; the app has Greek and
   English only. Essentials in English is the minimum; a third language is a
   content cost per card.
4. **Liability.** Do we say "informational, check official sources" on every
   safety/transport card? Probably yes — worth a short legal look before launch.
5. **Do tourists create accounts?** Looking at Essentials and building a trip
   should work **without** one (low friction for a one-week user); account only
   to save, redeem, or earn.
6. **Does the account-page identity model change the tourist experience?** See
   the 2026-10-11 note in `IDEAS.md`: tourist/local fixed at sign-up, Guide
   earned.

## Not now

- Anything that moves money, or any payment provider (guardrail; deals only
  issue and burn codes)
- AI-written summaries or AI trip generation (paid per call; revisit after
  February 2027 — it would also be a good fit for "plan my 5 days")
- Region-management admin UI
- Selling or sharing individual trip data (location is personal data under GDPR;
  only aggregated, anonymous insight is acceptable)
