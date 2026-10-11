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
2. [ ] ← _next_ **2-line summaries** for every place/route (start from `places.short`),
       shown as quick-pick cards.
3. [ ] **Trip builder, device-only** — "how many days?", take a ready-made route
       or build your own by swiping summary cards into days; Trip card per day.
       No database change until we know it is fun.
4. [ ] **Titles + "% of Ilia discovered"** — decide the denominator (places vs.
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
