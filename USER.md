# USER.md

Last updated: 2026-06-17

Project: ΗΛΕΙΑ PULSE

Purpose: define the full user account, authentication, profile, settings, and posting identity plan for the existing Supabase-backed app.

This began as a planning document. Several pieces are now implemented in code and Supabase; remaining recommendations are still kept here for product/security context.

## Implementation Status Update

Implemented on 2026-06-17:

- Supabase Auth email/password signup and login UI.
- Email confirmation disabled for the early build, so signup does not require clicking an email link.
- Top-right account bubble.
- Account/settings sheet with profile fields, posting identity, avatar upload, saved counts, and sign-out.
- `public.profiles`, `public.user_preferences`, and `public.user_security_events`.
- Profile images through Supabase Storage bucket `avatars`.
- Profile identity on posts, comments, and user-created places.
- Supabase-backed full story rows and story seen-state.
- Supabase-backed Meet events and RSVPs.
- Supabase-backed contribution activity days/streak.
- Smoke tests:
  - `npm run smoke:auth-profile`
  - `npm run smoke:post-write`
  - `npm run smoke:live-surfaces`

## Executive Summary

ΗΛΕΙΑ PULSE should use Supabase Auth as the only authentication system.

The app should not create its own password hashing, auth tokens, custom session store, or custom permission engine. Supabase should handle identity, sessions, email verification, password reset, magic links, anonymous sessions where useful, and JWT issuance. Postgres Row Level Security should enforce what each user can read or write.

The product model should be:

- Supabase Auth answers: "Who is this user?"
- `public.profiles` answers: "How should this user appear inside ΗΛΕΙΑ PULSE?"
- Postgres RLS answers: "Is this user allowed to read, create, update, or delete this row?"
- The frontend answers: "How do we make that flow feel clear, local, and mobile-first?"

The most important user-facing change is a persistent account entry point in the top-right of the app shell:

- Signed out: a small user bubble opens sign-in/create-account.
- Signed in: the same user bubble opens user settings.
- Incomplete profile: the bubble shows an unfinished state and opens profile completion.
- While posting: the composer must respect the user's chosen posting identity, but the database must tie the row to `auth.uid()`.

## Current Project Context

The current app lives at:

Use the local checkout of `GeorgeMavroeidis/hleias-pulse`. On George's Windows machine the
project folder is `C:\Users\user\Desktop\hleias-pulse-mavroeidis`.

Current stack:

- React 19
- TanStack Start / TanStack Router shell
- Vite static build for Cloudflare
- Tailwind CSS v4
- shadcn/ui configured with Radix primitives and `new-york` style
- Lucide icons
- Framer Motion
- Supabase JS client
- Supabase project ref: `kfxfnqryfmuxiwlswyyn`

Important current files:

- `src/components/hp/PulseApp.tsx`
- `src/components/hp/ProfileSheet.tsx`
- `src/components/hp/OnboardingGate.tsx`
- `src/lib/hp-api.ts`
- `src/lib/hp-model.ts`
- `src/lib/supabase/client.ts`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/styles.css`
- `supabase/migrations/20260614081500_create_ilia_pulse_schema.sql`
- `supabase/migrations/20260614125500_enable_user_created_places.sql`
- `supabase/migrations/20260614133000_add_pulse_bootstrap_rpc.sql`

Current account-related behavior:

- The app uses Supabase already.
- User writes are tied to `user_id` from Supabase Auth.
- Loading user state no longer creates an anonymous Supabase user when there is no session.
- Profile-gated writes use the signed-in user's `profile_id` and posting identity.
- Posts/comments still keep compatibility fields like `author_id`, but visible user identity resolves from `profiles`.
- Stories are Supabase rows and no longer use local hardcoded story authors.
- The top bar has a real account bubble.
- `AuthAccountSheets.tsx` is the real auth/account settings surface.
- `ProfileSheet.tsx` is legacy display code and is not the active account settings UI.

The upgrade should keep the mobile-first tactile product direction, but replace fake identity with real Supabase-backed profile identity.

## Non-Negotiable Security Principles

1. Do not build custom authentication.
   Use Supabase Auth for sign up, sign in, password reset, magic links, sessions, refresh tokens, email confirmation, and provider linking.

2. Do not put secret keys in React.
   The frontend may use only the Supabase URL and publishable key. Secret/service-role keys must never appear in frontend code, static build output, mobile bundle, screenshots, docs, commits, logs, or Cloudflare static uploads.

3. Enable RLS on every exposed table.
   Every table in `public` that can be reached through the browser must have RLS enabled and least-privilege policies.

4. Trust `auth.uid()`, not the UI.
   The frontend can show or hide controls, but the database must enforce ownership.

5. Do not trust `user_metadata` for permissions.
   User metadata can describe display preferences, but roles, verification, moderation status, admin status, and business verification must live in server-controlled tables or `app_metadata`.

6. Keep profile data minimal.
   Only collect what the app needs: display name, handle, avatar, default posting identity, language, vibe preferences, and optional area.

7. Separate public profile from private account data.
   Public display fields can be readable. Email, provider details, MFA state, notification preferences, deletion state, and audit records should be private.

8. Use the database for identity integrity.
   Posts, comments, stories, places, saves, and likes should all include `user_id = auth.uid()`. Display names can be shown from profile data, but ownership must come from `user_id`.

9. Sensitive actions require stronger confirmation.
   Email change, password change, account deletion, exporting account data, business verification, or admin actions should require recent sign-in and ideally MFA for privileged users.

10. Fail closed.
    If profile lookup fails, write actions should pause and show a clear sign-in/profile-completion prompt. Do not write anonymous fake display identity as a fallback for signed-in features.

## Recommended Auth Product Strategy

### Phase 1 Auth Methods

Use these first:

- Email/password
- Magic link or email OTP
- Password reset
- Email confirmation

Optional, but useful soon:

- Google OAuth
- Apple OAuth if iOS/App Store becomes important

Later:

- MFA for account security
- Required MFA for admins, business owners, moderators, exports, and account deletion

Do not start with:

- Custom password tables
- Custom JWT issuance
- Third-party auth provider unless there is a clear reason
- Phone auth unless SMS cost and abuse handling are planned

### Email Delivery

Development:

- Supabase built-in email is acceptable for testing.

Production:

- Configure custom SMTP.
- Emails should come from the app's own domain.
- Configure redirect URLs in Supabase Auth settings.
- Customize email templates so users understand they are logging into ΗΛΕΙΑ PULSE.

Email templates needed:

- Confirm signup
- Magic link / OTP
- Password reset
- Email change confirmation
- Reauthentication
- Invite user, if admin invitations are introduced later

### Redirect URLs

Supabase should allow redirects for:

- Local dev URL
- Cloudflare production URL
- iOS deep link, if mobile deep linking is added
- `/auth/callback`
- `/auth/reset-password`
- `/onboarding/profile`

The key callback route should be:

`/auth/callback`

Purpose:

- Receive the Supabase auth result after email confirmation, magic link, OAuth, or password reset.
- Finish session setup.
- Load the profile.
- Redirect the user to the correct next screen.

Callback routing decision:

- No valid session: go to sign-in.
- Session exists and no profile row: go to profile creation.
- Session exists and profile exists but incomplete: go to profile completion.
- Session exists and profile complete: go back to the app, preserving intended destination.

## User UI Placement

### Top-Right User Bubble

The top-right user bubble is the main account entry point.

Current top bar:

- Left: logo and app name
- Right: search button, language toggle

Proposed top-right control order:

1. Search icon button
2. User bubble
3. Language toggle

Reason:

- Search remains easy to reach.
- Account becomes a first-class app control.
- Language stays available but should not be visually more important than account identity.

Mobile size:

- Bubble should be `36px` to `40px`.
- Use an avatar image when available.
- Use initials fallback when no avatar exists.
- Use a neutral person icon when signed out.
- Use a small ring/dot state, not a loud badge.

Bubble states:

- Signed out: neutral outline bubble.
- Loading session: skeleton shimmer or muted placeholder.
- Signed in and profile complete: avatar or initials.
- Signed in but profile incomplete: avatar/initials with a small amber dot.
- Admin/moderator: do not show a flashy public badge in the top bar. Keep admin controls inside settings.

Click behavior:

- Signed out: open `AuthSheet`.
- Signed in and profile incomplete: open profile completion.
- Signed in and profile complete: open `UserSettingsSheet`.

Do not use a large profile dropdown as the primary mobile interaction. This app is mobile-first, so a bottom sheet or full-height settings sheet is more ergonomic.

Desktop/tablet behavior:

- On wider screens, the bubble can open a compact dropdown first:
  - Profile/settings
  - Saved
  - Security
  - Sign out
- But mobile should go directly into the account/settings sheet.

### Existing `ProfileSheet.tsx`

Do not throw away the existing profile sheet immediately.

Recommended evolution:

- Rename conceptually from "profile placeholder" to "account profile/settings".
- Keep badges/streaks only as a secondary "Activity" tab.
- Put real account controls first.
- Replace hardcoded avatar and handle with Supabase profile data.
- The old "accounts & sync coming soon" placeholder has been replaced; the active account UI
  uses the real Supabase auth state.

Suggested new structure:

- `UserBubble`
- `AuthSheet`
- `UserSettingsSheet`
- `ProfileIdentityPanel`
- `AccountSecurityPanel`
- `PreferencesPanel`
- `ActivityPanel`
- `DangerZonePanel`

The existing `ProfileSheet.tsx` can become `UserSettingsSheet.tsx`, or it can be kept and gradually refactored.

### User Settings Sheet Layout

Use a bottom sheet on mobile.

Header:

- Avatar
- Display name
- Handle
- Identity badge, for example `Local`, `Visitor`, `Guide`, or `Business`
- Close button

Tabs:

- Profile
- Security
- Preferences
- Activity

Profile tab:

- Avatar upload/change
- Display name
- Handle
- Bio/short local note
- Default posting identity
- Home area, optional
- Public profile preview

Security tab:

- Email address
- Email verified status
- Change email
- Change password
- Magic link sign-in explanation
- MFA setup/status
- Connected providers
- Sign out
- Sign out all devices, if implemented

Preferences tab:

- Language: Greek / English
- Default map area, optional
- Vibe chips/favorite categories
- Location permission explanation
- Notification preferences, only if notifications are added

Activity tab:

- Posts
- Comments
- Places added
- Stories
- Saved items shortcut
- Badges/streaks if the gamified layer remains

Danger zone:

- Export my data
- Delete account
- Delete local anonymous session, if anonymous mode remains

Keep destructive actions behind `AlertDialog`.

### Sign-In UI

Use an `AuthSheet`, opened by the top-right user bubble or by gated write actions.

Primary layout:

- Title: "Sign in to post on ΗΛΕΙΑ PULSE"
- Email field
- Password field, if using password mode
- Primary button: "Continue"
- Secondary button: "Send magic link"
- Link: "Forgot password?"
- Small reassurance: "We use your account to sync saves, posts, and comments."

Do not say fake security claims like "bank-level" unless legally approved.

Auth sheet modes:

- Sign in
- Create account
- Magic link sent
- Forgot password
- Reset password
- Verify email

When a user tries to post while signed out:

- Do not silently create a named fake author.
- Open `AuthSheet`.
- After successful auth, return to the composer with their draft preserved.

### Onboarding UI

`OnboardingGate.tsx` currently handles product onboarding and vibe/location setup.

Recommended split:

- Keep product onboarding for first-run education.
- Add profile onboarding after real account creation.

Profile onboarding steps:

1. Choose display name.
2. Choose handle.
3. Choose default posting identity:
   - Local
   - Visitor
   - Guide
   - Business, if enabled later
4. Choose avatar or initials.
5. Choose language and vibe preferences.
6. Optional location permission.

The user should be able to skip optional fields, but not required fields:

- Required: display name, handle, default posting identity.
- Optional: avatar, bio, home area, vibe preferences, location.

### Composer UI and Posting Identity

Current composer has:

- `post`
- `place`
- `story`
- `Posting as`: Local, Tourist, Guide

Keep the "Posting as" idea, but make it profile-backed.

Recommended behavior:

- The composer defaults to `profile.default_identity`.
- The user can switch identity per post if allowed.
- The selected identity is stored with the post as `posting_identity`.
- The post is always owned by `user_id = auth.uid()`.
- The display author is derived from the profile, not from text entered in the composer.

Example display:

- Avatar
- Display name
- Handle
- Identity badge: `Local`, `Visitor`, `Guide`
- Optional "You" label only when viewing your own content

Do not let the user type arbitrary identity labels on each post.

Allowed identity values:

- `LOCAL`
- `TOURIST`
- `GUIDE`
- Later: `BUSINESS`
- Later: `EDITOR` or `MODERATOR`, but only server-controlled

Security rule:

- A normal user may pick `LOCAL`, `TOURIST`, or `GUIDE`.
- `BUSINESS`, `EDITOR`, `MODERATOR`, and verified labels must be controlled by server-side role/verification data, not self-selected profile fields.

### Feed/Post UI Identity Rules

Every post card should show:

- Profile avatar
- Display name
- Handle, if space allows
- Posting identity badge
- Place name
- Time
- Post text

For the current user's own post:

- Show an overflow menu with edit/delete if implemented.
- It is okay to show "You" as secondary context, but not as the saved author name.

For other users:

- Show their public profile display information.
- Do not expose email.
- Do not expose auth provider.
- Do not expose internal role unless it is intentionally public, such as verified business.

### Comments UI Identity Rules

Current comments store and display `author_name: "You"`.

Recommended upgrade:

- Comments should store `user_id`.
- Comments may store an immutable `author_name_snapshot` for historical display, but the app should prefer joining to public profile data.
- The optimistic UI can say "Posting..." or use the user's display name.
- Avoid permanently storing "You" as the author.

Comment display:

- Small avatar or initials
- Display name
- Text
- Optional "You" marker for own comments

### Stories UI Identity Rules

Current stories are Supabase-backed and use profile identity.

Implemented model:

- Persist user stories in `public.stories`.
- Store `user_id`, `profile_id`, `place_id`, `media_url`, `caption`, `kind`, expiry/report fields, and author display fields.
- Derive avatar/name from public profile.
- Keep "visible for 6h / 24h" by mapping that to `expires_after_hours`.

### Saved Tab

Current saved tab works with `saved_items`.

Recommended UX:

- Signed in: saved items sync normally.
- Anonymous user: saved items may work temporarily, but show a "Create account to keep these" prompt.
- After account creation, decide whether to migrate anonymous saved items into the real account.

Simple path:

- Require sign-in for cloud-synced saved items.
- Keep local-only saves only if product really needs frictionless anonymous save.

Best product path:

- Allow anonymous save using Supabase anonymous auth.
- Prompt the user to claim the session by adding email/password or magic link.
- Avoid losing saved items during signup.

## Proposed Supabase Data Model

The current schema should be extended, not replaced.

### `public.profiles`

Purpose:

- Public-facing app profile.
- One row per Supabase Auth user.
- Tied directly to `auth.users.id`.

Recommended fields:

- `id uuid primary key references auth.users(id) on delete cascade`
- `handle text unique not null`
- `display_name text not null`
- `avatar_url text`
- `bio text`
- `home_area text`
- `default_identity text not null`
- `profile_completed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Validation:

- Handle length: 3 to 30 characters.
- Handle allowed characters: lowercase letters, numbers, underscore, dot if desired.
- Display name length: 2 to 40 characters.
- Bio length: capped.
- `default_identity` must be one of allowed public user identity values.

RLS:

- Anyone can read safe public fields.
- Users can insert their own profile only when `id = auth.uid()`.
- Users can update their own profile only when `id = auth.uid()`.
- Users cannot set admin/moderator/business verification through this table.

### `public.user_preferences`

Purpose:

- User-specific settings that should not necessarily be public.

Recommended fields:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `language text not null default 'GR'`
- `vibe_chips text[] not null default '{}'`
- `home_map_area text`
- `location_enabled boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

RLS:

- User can select/insert/update/delete only their own row.
- No anon read.

### `public.user_security_events`

Purpose:

- Lightweight audit trail for account-sensitive events.

Recommended events:

- `profile_created`
- `profile_updated`
- `email_changed`
- `password_changed`
- `mfa_enrolled`
- `mfa_removed`
- `signed_out_all_devices`
- `account_deletion_requested`
- `account_deleted`
- `posting_identity_changed`

Fields:

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `event_type text not null`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

RLS:

- Users may read their own security events.
- Users should not directly insert arbitrary security events from the frontend unless the event is harmless.
- Prefer database functions or server/edge functions for sensitive audit events.

### `public.profile_blocks`

Optional later.

Purpose:

- Let users block other users.

Fields:

- `blocker_user_id uuid`
- `blocked_user_id uuid`
- `created_at timestamptz`

RLS:

- Users can manage their own block list.
- App queries should hide content where the current user blocks the author.

### `storage` Bucket: `avatars`

Purpose:

- User profile avatar uploads.

Policy:

- Authenticated users can upload only to their own folder, such as `avatars/{user_id}/...`.
- Public read is acceptable if avatars are public.
- If avatars should be private, use signed URLs instead.
- Limit file size and allowed MIME types.

Do not allow arbitrary authenticated users to upload anywhere in the bucket.

## Changes to Existing Tables

### `public.authors`

Current role:

- Editorial/system authors and seeded app authors.

Recommended future role:

- Keep `authors` for editorial, event, business seed, or system-controlled authors only.
- Do not use `authors` for normal Supabase users.
- Remove the fake user concept of `author_id = "you"`.

Important:

- Current `authors.type` check does not include `GUIDE`, while TypeScript `Author["type"]` does include `GUIDE`.
- This mismatch should be fixed when the profile/auth migration happens.

### `public.posts`

Current user writes:

- Has `user_id`.
- Uses `author_id: "you"`.
- Uses tags to infer posting identity.

Recommended additions:

- `profile_id uuid references public.profiles(id) on delete set null`
- `posting_identity text not null`
- `author_kind text not null default 'user'`

Recommended interpretation:

- If `author_kind = 'editorial'`, use `author_id`.
- If `author_kind = 'user'`, use `profile_id` / `user_id`.
- Do not derive identity from tags.
- Tags should remain content tags only.

RLS:

- Insert check: `user_id = auth.uid()`.
- Insert check: `profile_id = auth.uid()` for user posts.
- Update/delete: only own rows.
- Editorial rows are not writable from the frontend.

### `public.comments`

Current user writes:

- Has `user_id`.
- Stores `author_name`.
- Uses `author_id: "you"`.

Recommended additions:

- `profile_id uuid references public.profiles(id) on delete set null`
- `posting_identity text`
- Optional `author_name_snapshot text`

Recommended interpretation:

- Use `profile_id` for display whenever possible.
- Keep `author_name_snapshot` only if the product wants old comments to keep old names after profile rename.
- Do not use plain `author_name` as the source of truth for a user's identity.

RLS:

- Insert/update/delete only when `user_id = auth.uid()`.
- Public read can remain if comments are public.

### `public.places`

Current user writes:

- Has `user_id` after migration `20260614125500_enable_user_created_places.sql`.

Recommended additions:

- `profile_id uuid references public.profiles(id) on delete set null`
- `created_by_identity text`
- `moderation_status text default 'published'` or `pending`, depending on moderation needs

Recommendation:

- For public map quality, user-created places may need moderation.
- If moderation is not ready, use rate limits, required profile completion, and report/delete controls.

RLS:

- Public read only published/approved rows if moderation is introduced.
- Owner can update own pending/submitted rows.
- Owner delete own rows unless already approved and relied on by other content, in which case soft delete.

### `public.saved_items`

Current:

- Good owner-based model with `user_id`.

Recommended:

- Keep as-is.
- If supporting anonymous-to-real-account migration, plan a merge path.

### `public.post_likes`

Current:

- Good owner-based model with `(user_id, post_id)` primary key.

Recommended:

- Keep as-is.
- Consider database triggers to maintain `posts.likes_count` instead of client-side count assumptions.

### `public.stories`

Current:

- Full Supabase-backed story rows.
- Supports `user_id`, `profile_id`, `place_id`, `media_url`, `caption`, `kind`, report fields, expiry, moderation status, and timestamps.
- User-created stories insert directly into `public.stories`.
- Seen-state persists in `public.story_views`.
- RLS allows public read for published/non-expired stories and owner insert/update/delete for user-created stories.

## Profile Creation Strategy

There are two good options.

### Option A: Trigger-Created Empty Profile

When a Supabase Auth user is created, a Postgres trigger creates a `profiles` row.

Pros:

- Every auth user has a profile row.
- Fewer missing-profile edge cases.
- Common Supabase pattern.

Cons:

- You still need profile completion UI.
- If handle/display name are required, trigger needs temporary values or nullable fields.

Best use:

- Trigger creates minimal row.
- App completes required fields after callback.

### Option B: App-Created Profile After Auth

After successful auth callback, the app checks for a profile. If none exists, user goes to profile creation.

Pros:

- The app can force meaningful display name and handle.
- No placeholder public profile rows.

Cons:

- More edge cases.
- Must handle users who abandon onboarding.

Recommended approach:

- Use a trigger to create a minimal profile row.
- Let `profile_completed_at` decide whether the user can post.
- Keep display name/handle incomplete until onboarding is done.

Write actions should require:

- Auth session exists.
- Profile row exists.
- `profile_completed_at` is not null.

## Auth and Profile Flow

### First Visit

1. App loads.
2. Supabase session is checked.
3. If no session:
   - User can browse public map, routes, posts, places.
   - User bubble shows signed-out state.
   - Posting/commenting/sync saves prompt sign-in.
4. If anonymous session mode remains:
   - Saves and likes can work temporarily.
   - Posting should still require profile completion.

### Sign Up

1. User taps user bubble or a gated write action.
2. `AuthSheet` opens.
3. User creates account with email/password or requests magic link.
4. Supabase sends confirmation email if email confirmation is enabled.
5. User clicks email link.
6. Supabase redirects to `/auth/callback`.
7. App loads session.
8. App checks profile.
9. App sends user to profile completion if needed.
10. App returns user to previous intent, for example composer draft.

### Sign In

1. User enters email/password or asks for magic link.
2. Supabase signs in user or sends email link.
3. App loads profile and preferences.
4. Top-right bubble updates to avatar/initials.
5. User returns to the app context they came from.

### Password Reset

1. User chooses "Forgot password?"
2. Supabase sends reset email.
3. Reset email returns to `/auth/reset-password` or `/auth/callback?type=recovery`.
4. User sets a new password.
5. App returns to settings/security.

### Sign Out

1. User opens settings.
2. User taps Sign out.
3. App confirms only if unsaved drafts exist.
4. Supabase signs out.
5. Local auth/profile cache clears.
6. User bubble returns to signed-out state.

### Delete Account

Do not implement casually from the frontend with a service key.

Recommended:

- Use a controlled server function or Edge Function if deletion requires admin privileges.
- Request confirmation.
- Mark deletion requested.
- Delete or anonymize user-owned rows according to product/legal policy.
- Delete auth user as final step.

Simple first version:

- "Request account deletion" creates a deletion request row.
- Manual/admin process handles actual deletion until a safe automated flow exists.

## Route and File Placement

This app currently has a single route rendering `PulseApp`.

Recommended route additions:

- `src/routes/auth/callback.tsx`
- `src/routes/auth/reset-password.tsx`
- Optional: `src/routes/login.tsx`
- Optional: `src/routes/settings.tsx`

Because the app is mobile-shell-first, account UI can still appear as sheets inside `PulseApp`. Routes are useful for auth redirects and deep links.

Recommended component additions:

- `src/components/hp/UserBubble.tsx`
- `src/components/hp/AuthSheet.tsx`
- `src/components/hp/UserSettingsSheet.tsx`
- `src/components/hp/ProfileCompletionSheet.tsx`
- `src/components/hp/ProfileIdentityPanel.tsx`
- `src/components/hp/AccountSecurityPanel.tsx`
- `src/components/hp/UserPreferencesPanel.tsx`
- `src/components/hp/AccountDangerZone.tsx`

Recommended lib additions:

- `src/lib/auth/session.ts`
- `src/lib/auth/profile.ts`
- `src/lib/auth/redirects.ts`
- `src/lib/user-profile.ts`
- `src/lib/profile-display.ts`

Recommended Supabase migration:

- `supabase/migrations/YYYYMMDDHHMMSS_add_user_profiles_and_auth_identity.sql`

Recommended generated types update:

- Regenerate `src/lib/supabase/database.types.ts` after migrations.

## shadcn/ui Component Plan

The project already has these useful components installed:

- `avatar`
- `button`
- `input`
- `textarea`
- `select`
- `tabs`
- `sheet`
- `drawer`
- `dialog`
- `dropdown-menu`
- `alert-dialog`
- `badge`
- `separator`
- `skeleton`
- `switch`
- `form`
- `sonner`

Use existing shadcn components rather than custom markup where practical.

Recommended mapping:

- User bubble: `Avatar`, `Button`, optional `Tooltip`.
- Signed-out auth UI: `Sheet` or `Drawer`, `Input`, `Button`, `Separator`.
- Settings: `Sheet` plus `Tabs`.
- Dangerous actions: `AlertDialog`.
- Identity labels: `Badge`.
- Loading account state: `Skeleton`.
- Success/error feedback: `sonner` toast.
- Preference toggles: `Switch`, `Select`, `ToggleGroup` where appropriate.

Implementation note:

- This project uses Tailwind v4 and `src/styles.css`.
- Use the existing semantic/project tokens.
- Do not introduce a new visual language for auth.
- Do not make settings look like a generic SaaS dashboard. It should feel like part of the existing ΗΛΕΙΑ PULSE mobile shell.

## Detailed Implementation Phases

### Phase 0: Inventory and Decisions

Tasks:

- Confirm production URL and local dev URL.
- Confirm whether anonymous browsing stays.
- Confirm whether anonymous saves stay.
- Confirm whether posting requires verified email.
- Confirm whether user-created places are immediately published or pending moderation.
- Confirm whether user profile pages are public or only inline identity cards.
- Confirm whether avatar uploads are needed now or can start with initials.

Recommended decisions:

- Anonymous browsing: yes.
- Anonymous saves: optional, but nice.
- Posting/commenting/stories: require completed profile.
- Email verification: required for posting.
- User-created places: publish initially only if abuse is low; otherwise moderation status.
- Public profile pages: later. Start with inline profile identity.
- Avatars: support avatar URL or initials first; file uploads second.

Acceptance:

- Product owner knows exactly what auth gates exist before implementation starts.

### Phase 1: Supabase Auth Configuration

Tasks in Supabase Dashboard:

- Enable email auth.
- Email confirmation is currently disabled for early testing.
- Enable magic link or OTP later if product wants passwordless auth.
- Configure password reset.
- Configure redirect URLs.
- Configure custom SMTP before production.
- Enable CAPTCHA for signup/reset if abuse is expected.
- Configure password strength and leaked password protection.
- Review rate limits.
- Enable MFA as optional for normal users.
- Require MFA operationally for admins/moderators where possible.

Acceptance:

- Signup email lands in inbox.
- Magic link lands in inbox.
- Password reset lands in inbox.
- Redirects return to `/auth/callback`.
- No auth emails come from confusing development sender in production.

### Phase 2: Database Profile Migration

Tasks:

- Add `profiles`.
- Add `user_preferences`.
- Add optional `user_security_events`.
- Add profile creation trigger or app-created profile flow.
- Add avatar storage bucket and policies if avatars are included.
- Add `profile_id` and `posting_identity` to posts/comments/user story tables.
- Decide how to treat `authors` for editorial/system content.
- Fix `GUIDE` mismatch if user guide identity remains supported.

Acceptance:

- Every new auth user can have exactly one profile.
- Profile rows cascade when auth users are deleted.
- Public profile fields are readable without exposing email.
- Private preferences are readable only by the owner.

### Phase 3: RLS and Grants

Tasks:

- Enable RLS on all new tables.
- Add public read policy only for safe public profile fields.
- Add owner insert/update policies for profiles.
- Add owner-only policies for preferences.
- Update posts/comments policies to include `profile_id` checks.
- Ensure editorial content remains frontend-read-only.
- Ensure frontend cannot update `moderation_status`, verification, or role fields.

Acceptance:

- A user cannot update another user's profile.
- A user cannot write a post as another user.
- A user cannot assign themselves admin/editor/business verification.
- A signed-out browser cannot write social data.
- Secret key is not needed in frontend.

### Phase 4: Auth State Layer

Tasks:

- Add a small auth/profile state layer.
- Load Supabase session on app startup.
- Listen for auth changes.
- Load profile after session exists.
- Load preferences after session exists.
- Expose account state to `PulseApp`.
- Preserve current static build compatibility.

Recommended account states:

- `loading`
- `signedOut`
- `anonymous`
- `signedInProfileMissing`
- `signedInProfileIncomplete`
- `signedInReady`
- `mfaRequired`, later

Acceptance:

- Top-right bubble always reflects the correct auth state.
- App does not flash fake signed-in identity before loading.
- Composer can tell whether the user is allowed to post.

### Phase 5: Top Bar User Bubble

Tasks:

- Add `UserBubble` into `TopBar`.
- Pass account state to `TopBar`.
- Place it in the top-right control cluster between search and language.
- Use avatar/initials/person icon based on state.
- Add accessible label:
  - Signed out: "Sign in"
  - Signed in: "Open user settings"
  - Incomplete: "Complete profile"
- Open the right sheet based on state.

Acceptance:

- Bubble is visible on mobile and desktop.
- Bubble does not crowd the language toggle.
- Bubble is tappable with a comfortable hit target.
- Bubble works with keyboard focus.
- Bubble does not overlap safe area on iOS.

### Phase 6: AuthSheet

Tasks:

- Add sign-in/create-account UI.
- Add magic link option.
- Add forgot password flow.
- Add post-auth redirect intent handling.
- Preserve composer draft when auth interrupts posting.
- Show neutral, non-enumerating errors.

Acceptance:

- User can create account.
- User can sign in.
- User can request magic link.
- User can request password reset.
- If user started from composer, they return to composer after auth.

### Phase 7: Profile Completion

Tasks:

- Show profile completion after signup.
- Collect display name, handle, default posting identity, language.
- Validate handle locally and in DB.
- Save profile.
- Mark `profile_completed_at`.
- Return user to app or previous intent.

Acceptance:

- User cannot post with incomplete profile.
- Profile completion survives refresh.
- Handles are unique.
- Invalid handles are rejected clearly.

### Phase 8: User Settings

Tasks:

- Convert/replace `ProfileSheet` with auth-backed settings.
- Add profile edit form.
- Add security tab.
- Add preferences tab.
- Add activity tab.
- Add sign out.
- Add account deletion request.

Acceptance:

- Settings opens from top-right bubble.
- Profile edits update UI after save.
- Sign out clears user-specific visible state.
- Destructive actions require confirmation.

### Phase 9: Posting Identity Integration

Tasks:

- Replace `author_id: "you"` in post creation.
- Replace comment `author_name: "You"` as source of truth.
- Store `user_id`, `profile_id`, and `posting_identity`.
- Use profile display data in feed and comments.
- Keep editorial authors separate.
- Update bootstrap RPC to include public profile display data for user-generated content.

Acceptance:

- New posts show the user's real profile identity.
- New comments show the user's real profile identity.
- User cannot spoof another display identity by changing request payload.
- Selected posting identity appears as a badge.
- Tags remain content tags, not identity storage.

### Phase 10: Storage and Avatar Uploads

Tasks:

- Create `avatars` bucket.
- Add owner-scoped upload path.
- Limit file type and size.
- Save avatar path/url in profile.
- Add fallback initials.

Acceptance:

- User can set avatar.
- User cannot overwrite another user's avatar.
- Broken avatar falls back to initials.

### Phase 11: Anonymous Session Migration

Only needed if anonymous sessions remain.

Tasks:

- Decide what anonymous data can be claimed:
  - Saves
  - Likes
  - Drafts
  - Maybe not posts/comments
- On account creation, merge anonymous saved items into real profile.
- Avoid duplicate saved rows.
- Clear anonymous-only state after successful account claim.

Acceptance:

- User does not lose saves when creating account.
- Duplicates are not created.
- Anonymous session cannot claim another user's data.

### Phase 12: Testing and Verification

Run app checks:

- TypeScript
- Lint
- Build
- Static build
- Existing smoke post-write script, updated for profile identity

Manual browser/mobile checks:

- Signed-out app loads.
- Top-right bubble opens auth sheet.
- Email signup works.
- Callback route works.
- Profile completion works.
- Settings opens from bubble.
- Post composer gates signed-out users.
- Post composer respects selected identity.
- New post persists after refresh.
- Comment persists after refresh.
- Save persists after refresh.
- Sign out clears private state.
- Another user cannot edit/delete content they do not own.
- Mobile sheet layout does not overflow at 320px, 375px, 414px, and iPhone safe-area sizes.

Security checks:

- No service/secret key in frontend bundle.
- RLS enabled on all new public tables.
- Policies tested with two different users.
- Public profile read does not expose email.
- User metadata is not used for authorization.
- Supabase redirect URLs are locked to expected domains.
- Custom SMTP configured before launch.

## Posting Identity: Exact Product Rule

The app should respect user identity in two layers.

Layer 1: Account identity

- This is the real Supabase user.
- It is enforced by `auth.uid()`.
- It owns rows.
- It is not editable through request payloads.

Layer 2: Public posting identity

- This is how the user presents a specific post.
- Examples: Local, Visitor, Guide.
- It is constrained to allowed values.
- It can default from the profile.
- It can be changed per post only within allowed values.

The app must never rely on:

- A typed author name from the frontend.
- A client-supplied user ID.
- A client-supplied admin role.
- Tags as proof of identity.
- `user_metadata` as proof of permission.

Recommended copy in composer:

- Label: "Posting as"
- Helper: "This changes how your tip is framed. Your account still owns the post."

Identity options:

- Local: "I know the area"
- Visitor: "I am visiting"
- Guide: "I can recommend"
- Business: "I represent a place", later and verification-gated

## Best-Practice Security Checklist

Use this as the launch checklist.

Authentication:

- Supabase Auth only.
- Email confirmation disabled for early testing; enable before production if the product wants verified email ownership.
- Password reset enabled.
- Magic link/OTP enabled if product wants passwordless.
- Custom SMTP for production.
- Password strength rules configured.
- Leaked password protection enabled.
- CAPTCHA enabled for signup/reset if abuse appears.
- MFA available.
- MFA required for admin/moderator/business-sensitive actions.

Authorization:

- RLS enabled on all public tables.
- Owner policies use `auth.uid()`.
- Frontend never uses secret/service-role key.
- Public read policies expose only intentional public data.
- Roles/verification are server-controlled.

Data:

- Email stays in Supabase Auth, not public profile.
- Public profile has only display data.
- Preferences are owner-only.
- Security/audit events are owner/admin read.
- Deletion flow is deliberate.

Frontend:

- No fake signed-in identity.
- No permanent "You" author rows.
- Auth errors do not reveal whether an email exists.
- Profile completion required before posting.
- Draft preserved when sign-in interrupts posting.
- Settings and destructive actions are accessible.

Operations:

- Supabase redirect URLs reviewed.
- SMTP sender/domain verified.
- Secrets are not committed.
- Cloudflare upload does not include `.env`.
- Database types regenerated after migrations.
- RLS tested with at least two users.

## Proposed UI Copy

Top-right bubble labels:

- Signed out: "Sign in"
- Signed in: "Open user settings"
- Incomplete: "Complete your profile"

Auth sheet:

- "Sign in to post on ΗΛΕΙΑ PULSE"
- "Use your account to sync saves, posts, and local tips."
- "Send magic link"
- "Create account"
- "Forgot password?"

Profile completion:

- "How should people see you?"
- "Choose a public name and default posting identity."
- "You can change this later in settings."

Composer:

- "Posting as"
- "This changes how your tip is framed. Your account still owns the post."

Settings:

- "Public profile"
- "Security"
- "Preferences"
- "Activity"
- "Sign out"
- "Delete account"

## Recommended First Build Scope

Build the first version in this order:

1. Supabase auth config and callback route.
2. `profiles` and `user_preferences` tables with RLS.
3. Top-right user bubble.
4. Auth sheet.
5. Profile completion.
6. Settings sheet with Profile and Sign out.
7. Posting identity stored from profile.
8. Comments use profile identity.
9. Avatar initials fallback.
10. Custom SMTP and production redirect review.

Defer:

- Public profile pages.
- Business verification.
- Moderator dashboard.
- Full data export automation.
- Automatic account deletion.
- Social following.
- User blocking.
- Push notifications.
- Advanced MFA enforcement.

## Definition of Done

This user system is complete when:

- A signed-out user can browse public content.
- A signed-out user sees a clear account bubble in the top-right.
- A signed-out user is prompted to sign in before posting/commenting.
- A new user can sign up through Supabase Auth.
- A magic link or confirmation email returns through `/auth/callback`.
- A new user completes a public profile.
- A signed-in user can open settings from the top-right bubble.
- A signed-in user can update profile display fields.
- A signed-in user can sign out.
- A signed-in user can post with a selected posting identity.
- Posts and comments show the user's real profile identity.
- The database stores ownership with `auth.uid()`.
- RLS prevents users from editing/deleting rows they do not own.
- The frontend never contains a secret/service-role key.
- Production email uses custom SMTP.
- The static Cloudflare build does not include secrets.

## Official Docs Used for This Plan

- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase user management: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase row level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase password security: https://supabase.com/docs/guides/auth/password-security
- Supabase sessions: https://supabase.com/docs/guides/auth/sessions
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Supabase CAPTCHA: https://supabase.com/docs/guides/auth/auth-captcha
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- TanStack Start Supabase/basic auth examples: https://tanstack.com/start/latest/docs/framework/react/examples/start-supabase-basic
- shadcn/ui docs: https://ui.shadcn.com/docs
