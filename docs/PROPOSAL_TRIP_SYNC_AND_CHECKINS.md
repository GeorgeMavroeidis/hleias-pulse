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

## 2. Verified check-ins and points (extend `user_place_visits`)

**What already exists.** `user_place_visits` (`20260827120000`) stores "I have
been here": `(user_id, place_id)` primary key, `visited_at`, own-rows RLS, and
the user toggles it from the "I've been here" button in place details. It is
self-declared — nothing checks the user was there.

**Proposal: verify, don't duplicate.** Add one column instead of a new table:

| Column     | Type                             | Notes                                     |
| ---------- | -------------------------------- | ----------------------------------------- |
| `verified` | `boolean not null default false` | true only when the phone was ≤ 150 m away |

- Tighten the existing insert policy to `with check (user_id = auth.uid() and
verified = false)`, so the manual button keeps working but can never claim
  a verified visit.
- New function `check_in(place_id, lat, lng)` (`security definer`): measures
  the distance to the place and upserts the row with `verified = true` only if
  it is ≤ 150 m. **The coordinates are used inside the function and dropped —
  never stored**, keeping location precision at "was at this place", per the
  GDPR guardrail. Rate-limit inside the function (e.g. ≤ 20 per user per day).

**Points (computed, not stored).** A view or function over verified visits:
+10 per verified place, +5 if the user also posted a photo there, a bonus for
the first verified place in an area. Badges and Deals rewards come later.
Unverified "I've been here" rows earn nothing.

**Known weakness.** GPS can be faked. Keep rewards low-value (badges, small
discounts) until there is a stronger proof (e.g. a QR at the business, which
the Deals code flow already has).

## Before shipping either

- Migration in `supabase/migrations/`, RLS in the same migration.
- `npm run audit:rls` and regenerate `database.types.ts`.
- A smoke test that goes through the real `hp-api` path (see `smoke:moderation`
  for the pattern), including: another user cannot read my plan / check-ins,
  and a check-in 1 km away is refused.
