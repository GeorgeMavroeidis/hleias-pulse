# Essentials — what to verify before a card goes live

> For the team (Margaris, Mavroeidis and partners). The app already has the slots; the
> cards below are **drafts with no real text**, and visitors never see drafts. A card
> goes live only when **you** fill it in and mark it checked. Nothing here should be
> written from memory — check it against the official source and record where and when.

## How a card goes live

In `src/lib/hp/essentials.ts`, for each card:

1. Write `body` in **Greek and English** (short: 2–4 lines a tourist can act on).
2. Put the official page in `sourceUrl`.
3. Put today's date in `lastCheckedAt` (`"YYYY-MM-DD"`).
4. Change `draft` to `false`.

A card older than 90 days automatically shows "Needs re-checking". A card without a
`lastCheckedAt` cannot be published (a test enforces it).

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
| —   | Emergency number 112             | **Already live.**                                                                        | —                                                 | done  |

## Rules that keep it trustworthy

- **Link, don't copy, timetables.** A copied timetable goes stale silently; a link doesn't.
- **Every card has an owner** who re-checks it. An unowned card is worse than none.
- **Say "check the official source"** on anything about safety or transport — the app
  already shows this under every Essentials screen.
- **English is the minimum**; most visitors do not read Greek.
- **Offline matters:** visitors often roam with no data. Keep cards short; they are
  stored inside the app, not fetched.
- If you are unsure of a fact, leave the card as a draft. A missing card is fine; a
  wrong ferry time costs someone a day.

## Questions to settle first

1. **Who owns each card?** (fill the Owner column above)
2. **How often is "fresh"?** Default is 90 days; ferries and roads probably need less.
3. **Should the app show a "last updated" date to visitors?** It does today.
4. **Do we want the municipality's or another partner's logo on a card they verified?**
