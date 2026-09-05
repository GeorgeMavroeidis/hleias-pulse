# ARCHITECTURE

The agreed shape of ΗΛΕΙΑ PULSE. Changes land by PR with both owners approving.

Last updated: 2026-09-05

> **If you are an AI session: read this before exploring the codebase.** Everything below
> was verified against the repo, not inherited from older docs. `HANDOFF.md` and friends
> have been wrong before. If this file contradicts the code, the code wins — fix this file
> in the same PR.

---

## 1 · System shape

```
                    iOS shell (Capacitor)          Web build (Cloudflare)
                              \                      /
                               \                    /
                          React 19 · Vite 7 · TanStack · Tailwind 4
                                        |
              +-------------------------+-------------------------+
              |                         |                         |
      src/components/hp/**       src/components/admin/**      src/lib/hp/**
      product surface            admin workspace             discovery, area
      MARGARIS                   MAVROEIDIS                  intelligence, map
              |                         |                    MAVROEIDIS
              +-------------------------+-------------------------+
                                        |
                          src/lib/hp-api.ts · admin-api.ts
                          the ONLY door to data — MAVROEIDIS
                                        |
                          Supabase: Postgres + Auth + Storage + RLS
```

**The one invariant:** no component reaches Supabase directly. Everything goes through
`hp-api.ts` or `admin-api.ts`. A component that imports the Supabase client is a bug,
including when it is faster to write that way.

### Data access, verified 2026-09-05

`src/lib/hp-api.ts` exposes ~40 functions. The shape of every one of them is:
authenticate, write, read back, return a typed row. Two things follow from that and both
have bitten us:

- **Every `.insert().select()` needs a matching SELECT policy for the author's own row.**
  Missing that policy is what broke posting, commenting, places, stories and meet events
  for weeks with `[42501]` (fixed by `20260904190000_authors_can_read_own_content.sql`).
  It is the single most repeated mistake in this repo.
- **Writes require an account.** `ensurePulseUserId()` throws `AuthRequiredError`; detect
  it with the exported `isAuthRequiredError()`, never by matching the message. Background
  writes (`markPulseStoriesSeen`, `recordPulseActivityDay`) no-op when signed out and must
  never open a sign-in sheet unprompted.

### Moderation, as it stands today

`moderation_status` (`published` / `pending` / `hidden` / `rejected`) exists on `posts`,
`comments`, `places`, `stories`, `meet_events`. `moderateContent()` in `admin-api.ts:309`
drives it. **That is admin-only.** There is no `reports`, `user_blocks` or `user_mutes`
table and no user-facing report path. See contract MOD-1 below.

---

## 2 · Contract registry

A contract is published **before** its implementation, as a small PR of TypeScript
signatures that throw. That is what lets the other person build the same day instead of
the following week.

### MOD-1 · Report / block / mute — *proposed 2026-09-05, implementation pending*

Apple Guideline 1.2 requires content filtering, a report mechanism, user blocking and
published contact info for every UGC app. Without it the build is rejected.

```ts
// src/lib/hp-api.ts — Mavroeidis
type ReportTarget = 'post' | 'comment' | 'place' | 'story' | 'meet_event' | 'profile';
type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence'
                  | 'false_info' | 'other';

reportContent(input: { targetType: ReportTarget; targetId: string;
                       reason: ReportReason; note?: string }): Promise<void>;
blockUser(userId: string): Promise<void>;
unblockUser(userId: string): Promise<void>;
muteUser(userId: string): Promise<void>;
unmuteUser(userId: string): Promise<void>;
getMyBlocks(): Promise<{ blocked: string[]; muted: string[] }>;
```

Backing tables: `reports` (unique per reporter+target, so one person cannot spam the
queue), `user_blocks` (mutual hiding), `user_mutes` (one-way). **`loadPulseData()`
filters blocked content server-side.** Client-side filtering is not acceptable here —
this is a safety feature, not a display preference.

UI: `ReportSheet.tsx`, `BlockedUsersSheet.tsx`, an overflow entry on every content card,
and contact info reachable inside the app. Margaris builds against
`moderation-api-stub.ts` until the real functions land; the swap is one import per file.

---

## 3 · Decision log

Newest first. A decision without a reason is not a decision, it is a preference someone
will reverse in six weeks.

### 2026-09-05 · Web beta leads; iOS distribution deferred to January — *proposed*

No capital is available now. The Apple Developer Program (~99 €/yr) buys **distribution**,
not development: the iOS Simulator and a free Apple ID on your own device both cost
nothing. So the web build carries the real-user beta from September, and the Apple account
is purchased by **5 January 2027** — leaving ~8 weeks against a worst case of ~6
(D-U-N-S up to 2 weeks, enrolment days, App Store review days to weeks) before the March
target.

Cost of this: Stage 1's exit criterion changes from "TestFlight build with real testers"
to "web beta with real testers".

Benefit, which is larger: recruiting locals and partner businesses stops waiting on Apple
and starts in September. `ROADMAP.md` names the empty map as the single biggest risk to
the project; this is the cheapest thing we can do about it.

This also resolves the open question "web build: parity or lag?" — **web leads until
January.**

### 2026-09-05 · Contracts are published before implementations — *proposed*

Splitting ownership by layer (data vs. UI) removes merge conflicts but creates a serial
dependency: every product feature waits on a query. As of 2026-09-05 that shows —
Mavroeidis ~70% through Week 1, Margaris at 0%, with the blocking item on the UI side.

Publishing the TypeScript signatures first, as a small PR that throws, turns a serial
feature into a parallel one without touching CODEOWNERS at all.

### 2026-09-05 · Writing requires an account; browsing stays open

`signInAnonymously()` produced accountless rows that moderation could not act on and that
no report flow could meaningfully target. Anonymous browsing keeps the map useful to a
tourist who has not signed up.

### 2026-09-04 · The CLI owns the schema

All 20 migrations had been hand-pasted and were untracked, which is how `#24090000` landed
half-applied and broke posting for weeks. History is repaired. **Every migration now needs
Mavroeidis's explicit approval before it is applied** — no exceptions, including one-line
ones.

---

## 4 · Open decisions

| Decision | Blocks | Owner |
|---|---|---|
| Billing: flat monthly partnership vs. per-redemption | What gets built in Stage 2 | both |
| Apple account: Individual vs. Organization | D-U-N-S lead time (~2 weeks) if Organization | Margaris |
| Legal entity / invoicing for partner businesses | Taking money at all | Margaris + accountant |
| Keyed map tile provider before public launch | Stage 3 | Mavroeidis |

**On Apple's 30%:** coupons are redeemed at a physical shop, so they are real-world goods
and services and fall outside In-App Purchase. What we charge partner businesses is B2B
and invoiced outside the app. This changes the moment anything is sold to an end user
inside the app — a premium subscription would put us squarely inside IAP. Revisit here if
the billing decision moves that way.
