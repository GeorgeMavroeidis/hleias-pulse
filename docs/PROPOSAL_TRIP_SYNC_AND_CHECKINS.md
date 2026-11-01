# Proposal — trip sync and place check-ins

> Status: **proposal, not agreed.** Written 2026-11-01 for Margaris to discuss
> with Mavroeidis. Both features need new tables, so per CLAUDE.md (schema is
> the shared collision point) nothing is built until both agree. Nothing here
> touches the live database yet.

## 1. A trip that follows the user (`trip_plans`)

**Today.** The Trip plan lives only in `localStorage` (`hp.trip-plan.v1`,
`src/lib/hp/trip-plan.ts`). A new phone, another browser or cleared site data
loses it. That was deliberate for v1: nothing about someone's travel left the
device.

**Proposal.** Signed-in users get their plan synced; signed-out users keep the
device-only plan exactly as now.

| Column       | Type                                       | Notes                                     |
| ------------ | ------------------------------------------ | ----------------------------------------- |
| `user_id`    | `uuid` PK → `auth.users` on delete cascade | one plan per user                         |
| `days`       | `smallint` check 1–14                      | same bounds as `MIN_DAYS` / `MAX_DAYS`    |
| `items`      | `jsonb` check is array, ≤ 200 entries      | `[{ kind: "place" \| "route", id, day }]` |
| `updated_at` | `timestamptz` default `now()`              | last-write-wins merge with the device     |

**RLS.** Owner only — `select / insert / update / delete using (auth.uid() =
user_id)`. **No admin policy**: the team has no reason to read anyone's plan.

**Privacy.** The plan holds "day 1…N", never calendar dates, so it does not say
_when_ someone will be where. Deleting the account deletes the plan (cascade).

**Client.** `use-trip-plan.ts` already funnels every save through one place
(`savePlan` + `TRIP_PLAN_EVENT`); syncing is one upsert there plus a load on
sign-in. Merge rule: newer `updated_at` wins.

## 2. Place check-ins and points (`place_checkins`)

**Why.** Replaces the "Έχεις πάει;" card's guess (a place counts as visited if
you posted there), which Margaris finds inaccurate.

| Column          | Type                                    | Notes                                       |
| --------------- | --------------------------------------- | ------------------------------------------- |
| `id`            | `uuid` PK                               |                                             |
| `user_id`       | `uuid` → `auth.users` on delete cascade |                                             |
| `place_id`      | `text` → `places`                       |                                             |
| `checked_in_on` | `date` (Ilia calendar day)              | unique `(user_id, place_id, checked_in_on)` |
| `created_at`    | `timestamptz` default `now()`           |                                             |

**No coordinates are stored.** The phone sends its position once to a Postgres
function `check_in(place_id, lat, lng)` (`security definer`). The function
measures the distance to the place and inserts a row only if it is ≤ 150 m.
The coordinates are used inside the function and then dropped. This keeps
location precision at "was at this place on this day", per the GDPR guardrail.

**RLS.** `select` own rows only. **No `insert` policy** — rows can only come in
through `check_in()`, so nobody can insert a check-in without the distance test.
Rate limit inside the function (e.g. ≤ 20 check-ins per user per day).

**Points (computed, not stored).** A view or function over `place_checkins`:
+10 per check-in, +5 if the same user posted a photo at that place that day,
+bonus for the first check-in in an area. Badges and Deals rewards come later.

**Known weakness.** GPS can be faked. Keep rewards low-value (badges, small
discounts) until there is a stronger proof (e.g. a QR at the business, which
the Deals code flow already has).

## Before shipping either

- Migration in `supabase/migrations/`, RLS in the same migration.
- `npm run audit:rls` and regenerate `database.types.ts`.
- A smoke test that goes through the real `hp-api` path (see `smoke:moderation`
  for the pattern), including: another user cannot read my plan / check-ins,
  and a check-in 1 km away is refused.
