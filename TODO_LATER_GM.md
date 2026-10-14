# TODO_LATER_GM.md

> Margaris's (GM) running to-do list — what is parked, and the order we are
> working through the rest. Product background for every item:
> `docs/TOURIST_STAY_PACK.md` and `IDEAS.md`. The team-wide ordered plan is
> still `ROADMAP.md`; this file is the personal queue that feeds it.
>
> Working rule (2026-10-11): **code changes stay local** (branches/worktrees on
> this machine, not pushed); only these `.md` planning files go to `main`, via PR.

## Parked — continue later

### Account / profile page

- [x] UI reorganisation — local branch `feat/account-page-reorg` (identity shown
      read-only, edit form collapsed, pinned save bar, "Activity" and "For
      professionals" sections, labelled sign-out, translations). Checked
      locally 2026-10-11, looks right.
- [ ] Step 2 — lock `profiles.default_identity` against client writes (today the
      `Users can update own profile` RLS policy lets anyone write `GUIDE` /
      `BUSINESS`), remove the composer's own "Posting as" picker, migrate
      existing rows. Schema + auth model → talk to Mavroeidis first.
- [ ] Earned **Guide** title for locals (computed, never self-selected).
- [ ] Profile card / customer loyalty card — **all options still open**
      (flip card, QR first, NFC stand later; no own POS hardware).

## Decided 2026-10-14 (after trying the local build) — do in this order

1. [x] **Simpler post form** — done locally on branch `feat/composer-simplify`: no
       "posting as" picker (post takes the account identity), one-row place
       picker with "Change", small place thumbnail instead of a big banner,
       vibes optional and collapsed.
   - Also simplified (same branch): **Place** (name, type chips, description,
     "use my location"; everything else optional), **Story**, **Event**.
   - [ ] Later: let people upload a **photo** for a new place (needs a storage
         rule = database change, so talk to Mavroeidis first); pick the spot on
         a small map.
2. [x] **"Trip" tab** — done locally on branch `feat/trip-tab` (stacked on essentials,
       trip-planner and composer branches; local only) — a 5th button in the middle of the bottom bar, in
       orange like the "+", replacing the small "Essentials" pill under the logo.
       Inside: my trip on top ("Day 2 of 5"), big icons for Arrival / Roads /
       Watch out / Emergency, ready-made routes. **Only verified cards are
       shown to visitors**; drafts are visible to the team only.
3. [ ] ← _next_ **Profile redo** — current one is disliked on both looks and practicality
       (details to settle: what should come first when you open your profile?).
       Earlier local attempt: branch `feat/account-page-reorg`.

**Heads-up (2026-10-14):** Mavroeidis has a chain of 13 open PRs (#88-#100, the
"reliability" stack). #92 changes the same composer file as our PR #101 (it makes a
place choice mandatory, with no default place) — whichever merges first, the other
needs a rebase. The Trip tab branch will also overlap with #98-#100 (PulseApp,
top bar, shared tab types). Agree the merge order with him before opening more PRs.

## Now — in this order, one at a time

1. [x] **Essentials v1** — done locally 2026-10-11 on branch `feat/essentials`
       (local only, not pushed). "Χρήσιμα" pill under the logo opens a screen
       with 5 sections and 9 cards; each card shows Draft / Checked {date} /
       Needs re-checking. Only the 112 card has real text — **the team writes
       the rest** in `src/lib/hp/essentials.ts`. Tests: `npm run
test:essentials`. Later: move content to an admin-edited table; add
       official source links; English check of every card.
   - [ ] **Team task:** fill in the draft cards (ferries, cruise arrivals,
         car/taxi/bus, roads, first days, heat & fire, sea, hospitals &
         pharmacies) with a source link and the date you checked.
2. [x] **2-line summaries ("Γρήγορη ματιά")** — done locally 2026-10-11 on branch
       `feat/place-summaries` (local only). Essentials → "Τι να δεις" → "Γρήγορη
       ματιά σε όλα τα σημεία": all 51 places and 5 routes as short cards with
       time / cost / best time / who it suits. Greek text translated from the
       existing English descriptions.
   - [ ] **Team task:** read over the Greek descriptions and fix anything that
         sounds off; tune the rough visit times per kind of place.
3. [x] **Trip planner ("Σχεδίασε τις μέρες σου")** — done locally 2026-10-11 on
       branch `feat/trip-planner` (local only). Essentials → big card at the top.
       Pick how many days → fill them with a keep/skip card deck (moves on to the
       next day by itself once a day is full) or with ready-made routes; progress
       bar "X of N days planned"; warning on an over-full day; move/remove items.
       Saved on the phone only.
   - [ ] **Try it with real people** (friends, a few tourists) and note: is it
         fun? what is missing? That decides whether step 8 (saving to the
         account) is worth building.
   - [ ] Later ideas: order stops within a day by distance; show the day on
         the map; a "my trip today" shortcut each morning; share a trip.
4. [ ] ← _next_ **Titles + "% of Ilia discovered"** — decide the denominator (places vs.
       areas vs. weighted) and how a visit counts without being fakeable.
5. [ ] **Points / levels / rewards** — decision pending; if yes, built on the same
       events (visit, route finished, deal used, helpful tip). No cash.
6. [ ] **Onboarding questions** at sign-up (local/visiting, how many days,
       interests) — where Local/Visitor gets set once.
7. [ ] **Region-ready content** — a `region` on content so other prefectures can
       follow; do it when the first new table is designed.
8. [ ] **Save trips to the account** (needs tables + RLS) — only after 3 proves
       itself.

## Later / undecided

- Monetisation: pay-per-redemption, business subscriptions, sponsored placement
  (labelled), municipalities, affiliate links — after the 2027 season's numbers.
- Ownership of Essentials content (who keeps it fresh) — open question.

## At the very end (agreed 2026-10-14)

- [ ] **Fill the Essentials cards** — checklist for the team in
      `docs/ESSENTIALS_CONTENT_CHECKLIST.md` (8 cards, who owns each, what to check
      them against). Do the first six before showing the Trip tab to real visitors.
- [ ] **Trip tab, step B** — arrival date; events/meets during the stay; deals on
      planned stops; weather and sunset time; "Ask a local" on a stop; open a day
      in Maps; share a trip; a "Today" view.
- [ ] **Trip tab look** — done locally (`feat/trip-tab`): photo header, coloured tiles,
      big photo deck cards, photo grid for Quick look. Next: see it with real users.

## Near me + time awareness (2026-10-14)

- [x] **Near me** — done locally on `feat/trip-tab`: location or "where are you staying",
      distance and drive time on cards, Quick look and the deck sorted nearest first,
      dead end after skipping everything fixed.
- [ ] **Day anchor** — once a stop is kept for a day, the deck only suggests places near it,
      warns when something is far from the rest, orders stops within a day, shows the
      day's km and drive time.
- [ ] **Time awareness** — sunset time computed from date and place; soft time windows per
      kind of place; opening hours and closed days only from verified data the team
      collects (see `docs/TOURIST_STAY_PACK.md` -> "The day and the hour matter").
- [ ] **Team task:** collect opening hours for the ~11 places listed in the checklist.
