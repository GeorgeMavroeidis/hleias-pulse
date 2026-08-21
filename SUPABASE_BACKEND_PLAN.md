# ΗΛΕΙΑ PULSE Supabase Backend Plan

Last updated: 2026-06-14

## Goal

Move ΗΛΕΙΑ PULSE from local prototype data to a real Supabase-backed app.

All current local content and interaction state should live in Postgres:

- 51 coordinate-backed Ilia places
- pulse posts
- post/place/route comments
- authors
- events
- routes and route stops
- stories and vibe chips
- saved places/posts/routes
- post likes
- generated place stats that were moved to the seed-only source `scripts/hp-seed-data.ts`

The frontend should read from Supabase and write user actions back to Supabase without committing secrets or breaking the current mobile-first UI.

## Current State

- Supabase CLI login is complete on this machine.
- The frontend runtime no longer imports local seed data; seed source data lives in `scripts/hp-seed-data.ts` only.
- User-created places, posts, comments, likes, and saved items write to Supabase through anonymous/authenticated sessions.
- `.env` contains a local `SUPABASE_DB_PASSWORD` and must stay uncommitted.
- Supabase project files, migrations, generated types, and seed SQL now exist in the repo.
- Supabase project ref: `uihwsndveblfgmlhdngi`.

## Guardrails

- Do not commit `.env`, DB passwords, access tokens, service-role keys, or generated local config containing secrets.
- Browser/frontend code may only use the Supabase project URL and publishable anon key.
- Do not use the Supabase service-role key in React.
- Do not drop or overwrite unknown remote tables. Inspect/pull before applying migrations.
- Use idempotent seed writes with stable IDs and `on conflict` behavior.
- Preserve the existing UI behavior while replacing the data source.
- Keep the local, tactile, mobile-first design direction from `HANDOFF.md`.

## Phase 1: Supabase Project Bootstrap

Commands:

```bash
npm install @supabase/supabase-js
npm install --save-dev supabase
npx supabase init
npx supabase link --project-ref uihwsndveblfgmlhdngi --password "$SUPABASE_DB_PASSWORD"
npx supabase db pull remote_schema_snapshot --schema public --password "$SUPABASE_DB_PASSWORD"
```

Acceptance checks:

- `supabase/` exists locally.
- The repo is linked to project `uihwsndveblfgmlhdngi`.
- Existing remote schema is captured before local migrations are pushed.
- No secret values appear in git diff.

## Phase 2: Database Schema

Create migrations for these core tables:

- `authors`
- `places`
- `place_avatars`
- `posts`
- `comments`
- `events`
- `routes`
- `route_stops`
- `stories`
- `vibe_chips`
- `saved_items`
- `post_likes`

Expected modeling:

- Keep current string IDs where they already exist, such as `kourouta-beach`, `post-1`, and `route-1`.
- Use foreign keys from posts/events/routes/stops back to places and authors.
- Store tag lists as `text[]`.
- Store map coordinates as `lat` and `lng` numeric columns.
- Store current display stats like `pulse`, `hotness`, `comment_count`, `recent_post_count`, and `status`.
- Add `created_at` and `updated_at` where content can change.
- Add useful indexes for `place_id`, `author_id`, `created_at`, and saved/liked item lookups.

Acceptance checks:

- Migration applies cleanly to a fresh local/remote database.
- Foreign keys prevent orphaned posts, events, routes, and route stops.
- Queries needed by the app can be done without client-side table guessing.

## Phase 3: Seed Current App Data

Convert the existing local seed data into Supabase seed rows:

- `PLACES` from `scripts/hp-seed-data.ts`, including computed coordinates/stats/avatars.
- `AUTHORS`
- `POSTS` and their embedded sample comments
- `EVENTS`
- `ROUTES` and nested stops
- `STORIES`
- `VIBE_CHIPS`

Implementation preference:

- Keep seed generation repeatable.
- Use stable IDs and `insert ... on conflict ... do update`.
- Preserve existing text and image URLs exactly unless there is a clear data-quality issue.
- Add a small verification query script or SQL block that confirms expected row counts.

Acceptance checks:

- Supabase contains all app-visible data from the seed source.
- Re-running seed does not create duplicates.
- Seeded post comments are represented as real `comments` rows.

## Phase 4: Security And Access

Enable Row Level Security on app tables.

Initial policy target:

- Public/anon can read published app content.
- Only authenticated users can insert comments, posts, places, likes, and saves.
- Users can update/delete only their own social rows.
- Editorial seed tables are not writable from the frontend.

Auth approach:

- Prefer Supabase Auth anonymous/user sessions for social writes.
- If anonymous auth is not enabled in the Supabase dashboard, the first frontend pass should make reads live and keep writes guarded until auth is enabled.

Acceptance checks:

- Public reads work with the publishable key.
- Writes do not work with only public table access unless allowed by policy.
- The frontend never needs a service-role key.

## Phase 5: Frontend Data Integration

Add Supabase client and typed data access:

- `src/lib/supabase/client.ts`
- generated DB types, for example `src/lib/supabase/database.types.ts`
- app-facing data mapping helpers, for example `src/lib/hp-api.ts`
- `get_pulse_bootstrap` RPC for one-shot explicit-column initial app data loading

Replace local data imports progressively:

- `PulseApp.tsx` should fetch places, posts, events, routes, authors, stories, and vibe chips from Supabase.
- `SocialMap.tsx` should receive places as props instead of importing `PLACES`.
- Create-post flow should insert into `posts`.
- Create-place flow should insert into `places` and `place_avatars`.
- Comment flows should insert into `comments`.
- Like/save flows should upsert/delete rows in `post_likes` and `saved_items`.
- UI should retain optimistic feedback where practical, then revalidate from Supabase.

Acceptance checks:

- App still renders when Supabase env vars are present.
- Initial content loads through `get_pulse_bootstrap`, not ten broad table reads.
- Map shows the 51 places from the database.
- Pulse feed shows database posts.
- Post creation persists after refresh.
- Place creation persists after refresh.
- Comments persist after refresh.
- Likes/saves persist for the active authenticated/anonymous user.

## Phase 6: Verification And Deployment Readiness

Run database checks:

```bash
npx supabase db push --dry-run --password "$SUPABASE_DB_PASSWORD"
npx supabase db push --password "$SUPABASE_DB_PASSWORD"
npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
```

Run app checks:

```bash
npx tsc --noEmit
npm run lint
npm run build
npx vite build --config vite.static.config.ts
npm run smoke:post-write
```

Browser checks:

- Desktop and mobile viewport load.
- No console errors beyond normal React DevTools info.
- Map tiles and markers render.
- Search/vibe filters still work.
- Place detail, post detail, route detail, saved tab, and composer still fit inside the mobile shell.
- Data created in the app survives refresh.

Cloudflare readiness:

- Cloudflare env vars must contain only the Supabase URL and publishable key.
- Static upload folder must not contain `.env`.

## Completion Criteria

The migration is complete when:

- The seed data is no longer inside the frontend runtime source path and is not the runtime source of truth.
- Supabase contains the current places, posts, comments, events, routes, stories, vibe chips, authors, saves, and likes.
- User-facing writes persist in Supabase.
- User-created places are protected by owner-based RLS.
- RLS is enabled and verified.
- TypeScript, lint, app build, static build, and browser smoke checks pass.
