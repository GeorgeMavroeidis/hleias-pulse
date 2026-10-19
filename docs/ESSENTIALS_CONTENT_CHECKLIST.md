# Essentials — what to verify before a card goes live

> For the team (Margaris, Mavroeidis and partners). This checklist describes the
> Essentials prototype reported in `TODO_LATER_GM.md`; its implementation branch
> is not available in this clone and is not in `main` as of 2026-10-19. The
> publication behavior below must be verified when that code is shared. The
> eight cards are reported as drafts with no real text. Nothing here should be
> written from memory — check the official source and record where and when.

## How a card goes live

In the reported prototype's `src/lib/hp/essentials.ts` (absent from `main`),
the proposed publication process for each card is:

1. Write `body` in **Greek and English** (short: 2–4 lines a tourist can act on).
2. Put the official page in `sourceUrl`.
3. Put today's date in `lastCheckedAt` (`"YYYY-MM-DD"`).
4. Change `draft` to `false`.

The prototype is reported to show "Needs re-checking" after 90 days and to reject
publication without `lastCheckedAt`. Verify that behavior and its tests in the
shared implementation before accepting it; this PR adds no such enforcement.

## The cards, in priority order

Start with the first six — with those done the Trip tab stops looking empty.

| #   | Card                             | What a visitor needs                                                                     | Check against                                     | Owner |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- | ----- |
| 1   | Ferries to the islands           | Which ports and routes; how to check today's timetable; how early to arrive; booking     | The ferry operators' own pages / port authority   | ?     |
| 2   | Arriving by cruise ship          | Where the ship docks, how far the town is, how to get around without a car, return times | Port / cruise agent information                   | ?     |
| 3   | Car, taxi, buses                 | Main ways to get around, rough costs, where to rent, parking, the bus operator           | Operator websites, municipality                   | ?     |
| 4   | Roads right now                  | Closed or damaged roads, roadworks, mountain-road warnings                               | Regional authority / traffic police announcements | ?     |
| 5   | Heat and fire risk               | What the warning levels mean, what to do on a fire alert, how to report one (112)        | Civil Protection (fire risk map), 112             | ?     |
| 6   | Hospitals and on-duty pharmacies | Nearest hospital for each area, how to find tonight's pharmacy                           | Regional health authority, pharmacists' guild     | ?     |
| 7   | Sea and beaches                  | Currents, jellyfish season, flag meanings, which beaches have lifeguards                 | Port authority / municipality                     | ?     |
| 8   | If you only have a few days      | A 3-line "start here" that links into places and routes (not a second copy of them)      | Our own routes                                    | ?     |
| —   | Emergency number 112             | Reported as filled in the local prototype; not published by this PR.                    | Verify the prototype's source and checked date     | ?     |

## Rules that keep it trustworthy

- **Link, don't copy, timetables.** A copied timetable goes stale silently; a link doesn't.
- **Every card has an owner** who re-checks it. An unowned card is worse than none.
- **Say "check the official source"** on anything about safety or transport —
  verify this notice on every Essentials screen when the prototype is shared.
- **English is the minimum**; most visitors do not read Greek.
- **Offline matters:** visitors often roam with no data. Keep cards short; the
  prototype reportedly bundles them, but offline access still needs acceptance.
- If you are unsure of a fact, leave the card as a draft. A missing card is fine; a
  wrong ferry time costs someone a day.

## Questions to settle first

1. **Who owns each card?** (fill the Owner column above)
2. **How often is "fresh"?** Default is 90 days; ferries and roads probably need less.
3. **Should the app show a "last updated" date to visitors?** Reported in the
   prototype; verify its wording and behavior before integration.
4. **Do we want the municipality's or another partner's logo on a card they verified?**

## Opening hours to collect (needed for a trip planner that respects time)

For each place below: **weekly opening hours, closed days, seasonal changes, and the
source and date you checked**. Same rule as the cards: no guessing.

- Ancient Olympia, Olympia Stadium, Archaeological Museum of Olympia, Museum of the
  Ancient Olympic Games
- Ancient Elis and the Elis agora, Samiko acropolis
- Temple of Apollo Epicurius (Bassae), Chlemoutsi castle
- Mercouri estate (winery visits), Skafidia monastery
- Thermal baths of Kyllini, Nemouta waterfalls (access and season)

For beaches, villages and ports, collect access restrictions or closures whenever
they apply; do not assume every location is accessible all day. Time-of-day
suggestions remain soft hints until the implementation and content are verified.
