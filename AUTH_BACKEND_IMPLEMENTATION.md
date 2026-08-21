# Auth Backend Implementation

Last updated: 2026-06-17

Project: ΗΛΕΙΑ PULSE

Supabase project ref: `uihwsndveblfgmlhdngi`

Status: auth/profile backend, account UI, and live Supabase-backed social surfaces implemented and smoke-tested against the linked remote Supabase project.

## Scope Completed

This started as a backend pass and now includes the account UI plus Supabase-backed story and Meet surfaces.

Implemented:

- Supabase-backed user profile tables.
- Automatic profile creation when a Supabase Auth user is created.
- User preferences table.
- Lightweight user security event table.
- Avatar/profile image storage bucket and owner-scoped storage policies.
- Profile identity fields on posts, comments, and user-created places.
- RLS policies that keep ownership tied to `auth.uid()`.
- Backward compatibility for the existing anonymous write path.
- A repeatable auth/profile smoke test.
- A repeatable live-surfaces smoke test for stories, story views, Meet events, RSVPs, and contribution streaks.
- Regenerated Supabase TypeScript database types.
- Frontend account/auth sheets and top-right account bubble.
- Supabase-backed story creation and seen-state.
- Supabase-backed Meet events and RSVPs.
- Supabase-backed contribution activity days/streak.

Not implemented:

- Password reset UI.
- Production SMTP.

## Reality Check Before Changes

The linked Supabase project was reachable through both:

- Supabase CLI/project management.
- Direct Postgres connection using the local `SUPABASE_DB_PASSWORD`.
- Public API reads using the app's current publishable key.

Pre-change live facts:

- The remote project was `ACTIVE_HEALTHY`.
- Existing migrations were already synced through `20260614133000`.
- Public API read worked and returned `51` places.
- Existing social tables already had `user_id` on posts/comments/places/saves/likes.
- Posts/comments still used fake display identity fields like `author_id = "you"` and `author_name = "You"`.
- No `profiles` table existed yet.
- No avatar bucket existed yet.

## Migrations Applied

### `20260617123431_add_user_profiles_auth_identity.sql`

Adds the main account/profile backend.

Created:

- `public.profiles`
- `public.user_preferences`
- `public.user_security_events`
- `storage.buckets` row for `avatars`

Changed:

- `public.authors` now allows `GUIDE`, matching the TypeScript `Author` model.
- `public.posts` now has:
  - `profile_id`
  - `posting_identity`
  - `author_kind`
- `public.comments` now has:
  - `profile_id`
  - `posting_identity`
  - `author_kind`
- `public.places` now has:
  - `profile_id`
  - `created_by_identity`
  - `moderation_status`

Added:

- Profile creation trigger on `auth.users`.
- Backfill for existing `auth.users`.
- Owner-based RLS policies for profiles/preferences.
- Owner-compatible RLS checks for posts/comments/places.
- Avatar storage policies:
  - public read for avatar objects
  - authenticated upload/update/delete only inside the user's own folder
- `get_pulse_bootstrap()` now includes profile data and the new identity fields.

Important detail:

- The storage table is owned by Supabase internals. The first push attempt correctly failed on an unnecessary `alter table storage.objects enable row level security`. That statement was removed, the failed migration rolled back cleanly, and the corrected migration applied successfully.

### `20260617124506_fix_auth_profile_trigger_default_identity.sql`

Fixes anonymous-user compatibility.

Reason:

- Anonymous Supabase Auth users have no `default_identity` metadata.
- The first trigger version did not explicitly convert null metadata to `LOCAL`.
- Existing anonymous post-write smoke exposed this with `Database error creating anonymous user`.

Fix:

- `handle_new_auth_user()` now treats null or invalid `default_identity` as `LOCAL`.

Result:

- Existing anonymous write path works again.

### `20260617161000_make_live_surfaces_supabase.sql`

Makes the remaining live/demo surfaces database-backed.

Created:

- `public.meet_events`
- `public.event_rsvps`
- `public.story_views`
- `public.user_activity_days`

Changed:

- `public.stories` now stores full story cards:
  - author/profile identity
  - media URL
  - caption
  - kind
  - report fields
  - expiry window
  - moderation status
- `get_pulse_bootstrap()` now returns full stories and Meet events.

Added:

- Public read policies for published stories and Meet events.
- Owner policies for user-created stories and hosted Meet events.
- Owner policies for RSVPs, story views, and activity days.
- RSVP count trigger that keeps `meet_events.going_count` and `meet_events.maybe_count` in sync.
- Supabase seed rows for the initial story rail and Meet tab content.

Frontend changes:

- Removed the local story seed array.
- Removed localStorage-backed story seen state.
- Removed generated Meet events.
- Removed localStorage-backed Meet RSVPs and hosted events.
- Removed localStorage-backed contribution streaks.

## User Profile Model

`public.profiles`:

- `id`
- `handle`
- `display_name`
- `avatar_url`
- `avatar_path`
- `bio`
- `home_area`
- `default_identity`
- `profile_completed_at`
- `created_at`
- `updated_at`

Rules:

- `id` references `auth.users(id)` and cascades on auth user deletion.
- `handle` is unique case-insensitively when present.
- `handle` format is lowercase letters, numbers, underscore, and dot.
- `default_identity` is one of:
  - `LOCAL`
  - `TOURIST`
  - `GUIDE`
  - `BUSINESS`
- Completed profiles require `handle`, `display_name`, and `default_identity`.

## Profile Images

Implemented avatar support through Supabase Storage:

- Bucket: `avatars`
- Public read: yes
- File size limit: `2 MiB`
- Allowed MIME types:
  - `image/png`
  - `image/jpeg`
  - `image/webp`

Path rule:

- Users can write only under their own folder:
  - `{auth.uid()}/filename.png`

Example smoke-tested path shape:

- `{user_id}/smoke-avatar.png`

## Posting Identity

The backend now supports two separate identity layers.

Account identity:

- Stored through Supabase Auth.
- Enforced by `auth.uid()`.
- Owns posts/comments/places/saves/likes.

Public posting identity:

- Stored on content rows as `posting_identity`.
- Allowed values:
  - `LOCAL`
  - `TOURIST`
  - `GUIDE`
  - `BUSINESS`

Content ownership:

- `posts.user_id = auth.uid()`
- `comments.user_id = auth.uid()`
- `places.user_id = auth.uid()`

Profile identity:

- User-generated content can now set `profile_id = auth.uid()`.
- RLS allows old writes with `profile_id is null` for temporary frontend compatibility.
- New frontend should set `profile_id` and `posting_identity`.

## Auth Behavior Reality

The remote project has email confirmations disabled for the early build.

Evidence:

- `supabase/config.toml` has `[auth.email].enable_confirmations = false`.
- `npx supabase config push --project-ref uihwsndveblfgmlhdngi` updated the remote auth config.
- Public signup smoke returned an immediate session after the config push.
- `npm run smoke:auth-profile` logs in through normal email/password auth without an email confirmation click.

What this means:

- Self-service email/password signup can create a usable session immediately.
- Supabase Auth still owns password hashing, sessions, refresh tokens, and user IDs.
- Password reset UI is still intentionally not implemented.

Smoke test approach:

- To avoid sending emails and avoid the active email rate limit, the auth smoke test uses Supabase Auth Admin to create a disposable confirmed user.
- The service-role key is read from the local Supabase CLI session at runtime.
- The service-role key is not written to disk and is not printed.
- The test then logs in using normal Supabase email/password auth through the publishable client.

## Verification Results

### Migration dry run

Passed.

Command:

```bash
npx supabase db push --dry-run --password "$SUPABASE_DB_PASSWORD"
```

### Migration apply

Passed.

Remote migrations now include:

- `20260617123431`
- `20260617124506`

### Live schema verification

Passed.

Verified remotely:

- `public.profiles` exists.
- `public.user_preferences` exists.
- `public.user_security_events` exists.
- `avatars` storage bucket exists.
- New identity columns exist on `posts`, `comments`, and `places`.
- User/profile RLS policies exist.
- Avatar storage policies exist.

### Auth/profile smoke

Passed.

Command:

```bash
npm run smoke:auth-profile
```

Verified:

- Disposable Supabase Auth user created through Auth Admin.
- Normal email/password login succeeded.
- Profile row was created by the `auth.users` trigger.
- Profile update succeeded through owner RLS.
- Preferences update succeeded through owner RLS.
- Avatar upload succeeded through Storage policies.
- Profile-owned post insert succeeded.
- Profile-owned comment insert succeeded.
- Disposable user/content/avatar cleanup completed.

Final smoke result:

```text
smoke_auth_profile_ok confirmation_mode=password-login
```

### Existing anonymous post-write smoke

Passed after the trigger fix.

Command:

```bash
npm run smoke:post-write
```

Verified:

- Existing anonymous Supabase write path still works.
- A post can still be created and cleaned up through the current app API path.

### Live surfaces smoke

Passed after the story/Meet migration.

Command:

```bash
npm run smoke:live-surfaces
```

Verified:

- Bootstrap returns Supabase-backed story rows.
- Bootstrap returns Supabase-backed Meet events.
- A disposable confirmed user can create a story.
- Story seen-state persists through `public.story_views`.
- A disposable confirmed user can host a Meet event.
- RSVP status persists through `public.event_rsvps`.
- Activity streak persists through `public.user_activity_days`.
- Disposable story/event/user cleanup succeeds.

### Cleanup verification

Passed.

Final cleanup query returned:

```json
{
  "smoke_auth_users": 0,
  "smoke_posts": 0,
  "smoke_comments": 0,
  "smoke_avatar_objects": 0,
  "avatar_buckets": 1
}
```

## TypeScript Check

Command:

```bash
npx tsc --noEmit
```

Result:

- Passed after the live-surfaces wiring.

## Files Changed

Added:

- `supabase/migrations/20260617123431_add_user_profiles_auth_identity.sql`
- `supabase/migrations/20260617124506_fix_auth_profile_trigger_default_identity.sql`
- `supabase/migrations/20260617161000_make_live_surfaces_supabase.sql`
- `scripts/smoke-auth-profile.ts`
- `scripts/smoke-live-surfaces.ts`
- `AUTH_BACKEND_IMPLEMENTATION.md`
- `src/components/hp/AuthAccountSheets.tsx`
- `src/lib/hp-auth.ts`
- `src/lib/hp/activity-data.ts`

Changed:

- `package.json`
  - Added `smoke:auth-profile`.
  - Added `smoke:live-surfaces`.
- `src/lib/supabase/database.types.ts`
  - Regenerated from the linked Supabase project.
- `src/components/hp/PulseApp.tsx`
  - Wired auth/account UI, Supabase stories, Supabase Meet events, RSVPs, story views, and activity days.
- `src/lib/hp-api.ts`
  - Added live surface read/write methods.

## Remaining Auth/Product Step

Before production, decide the long-term auth product mode:

Option 1: no email click for early testing

- Disable email confirmations in Supabase Auth settings.
- Keep password login.
- Add password reset later.
- Configure SMTP before public production.

Option 2: safer production-style auth

- Keep email confirmations on.
- Add callback route and email verification UI.
- Configure SMTP.

For the current early build, no-click email/password auth, account UI, profile identity, and Supabase-backed live surfaces are working and smoke-tested.
