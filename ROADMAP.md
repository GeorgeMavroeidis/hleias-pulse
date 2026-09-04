# ΗΛΕΙΑ PULSE — Roadmap

Last updated: 2026-09-04 · Target: **season-ready by March 2027**

## Vision

Google Maps × Instagram × Twitter, for a region. Locals and tourists on the same live map.
Locals get a reason to meet in under-visited places; tourists get recommendations from real
people instead of review sites. Partner shops and cafés run deals users redeem in-app — that
is the revenue. Start in Ilia, prove it, expand region by region.

## Business model

Shop/café owners partner with us. They fund the discount as their marketing spend; we are the
channel that brings the customer. Users take a coupon code in-app, the shop redeems it, and
`deal_redemptions` is the receipt. Billing is either a flat monthly partnership or
per-redemption — **decision still open**, and it determines what gets built in Stage 2.

> The coupon pipeline is already built and verified working end-to-end.

---

# The three stages

Each is worthless without the one before it.

## STAGE 1 — REPAIR · September
> The app does not work. Nothing else matters until it does.

**Objective:** a person can sign up, post, comment, and see it — and two people can build in
parallel without destroying each other.

**Exit:** core loop verified end-to-end · CI green on every PR · `PulseApp.tsx` split ·
report/block shipped · **TestFlight build with real testers**.

## STAGE 2 — BUILD · October – January
> Make it worth opening twice.

**Objective:** complete the social loop and the money loop. Notifications, real profiles,
story expiry, moderation people can actually use, business onboarding, deal analytics.
App Store compliant and accepted.

**Exit:** a stranger in Pyrgos understands it in 30 seconds · Apple accepts the build ·
a real café owner has run a real redemption.

## STAGE 3 — DEPLOY · February – March
> An empty map is worth nothing. Fill it before the season.

**Objective:** 50–100 active locals posting weekly · 10–20 partner businesses with live deals ·
App Store launch · ready for summer 2027.

**Exit:** the map has organic content nobody on the team created.

> ⚠️ **The trap:** Stage 3 is the one you will leave until last. Don't. Start recruiting
> locals and businesses in **November**, in parallel. Code has a deadline; people have a
> lead time. Launching to an empty map is the single biggest risk to this project.

---

# September — two tracks

**Target by Sept 30: TestFlight build in real testers' hands.**

## Week 1 · Sept 4–10 — Make it work. Make it parallel.

| George — infra/data/security | Margaris — features/product |
|---|---|
| **D1** Diagnose RLS drift → corrective migration → apply → verify post+comment PASS | **D1–3** Report / block / mute (Apple 1.2 blocker) — all **new files**, zero conflict |
| **D1** Anonymous auth: enable, or gate the 24 write paths behind login | ↳ `ReportSheet`, `BlockedUsersSheet`, `hp-api` fns, migration request |
| **D2** Fix CARTO tiles + rehost Wikimedia images to Supabase Storage | **D4–5** First PRs against the freshly split screen files |
| **D2** CI (lint/tsc/tests/build) · branch-protect `main` · `CLAUDE.md` · `CONTRIBUTING.md` | ↳ Deals screen polish, empty states |
| **D3–4** 🔑 **Split `PulseApp.tsx` + `styles.css`** — unblocks everything | |
| **D5** `/ship` git automation · repoint stale smoke scripts · delete audit accounts · fix "roday" typo | |

> **Gate:** nothing in Week 2 starts until the split is merged and CI is green.

## Week 2 · Sept 11–17 — Complete the social loop

| George | Margaris |
|---|---|
| Push notifications infra — Capacitor + Supabase triggers | Notification UI + preferences |
| Business onboarding backend, `review_place_claim` wiring | Place-claim flow UI for shop owners |
| Deal analytics (`deal_redemptions` → owner dashboard) | Profile completeness, avatar, identity switcher |
| Bundle split — `PulseApp` chunk is 491 kB | Stories: expiry, viewer, seen-state |
| RLS audit across **all** tables, not just posts | Composer + post-to-place flow |

## Week 3 · Sept 18–24 — Money + mobile

| George | Margaris |
|---|---|
| Apple Developer account + Capacitor release pipeline | Business-facing deal creation UX |
| **First TestFlight build** | Moderation UX a human can actually use |
| Shop-owner redemption dashboard (scan / enter code) | Onboarding rewrite — the first 30 seconds |
| Error monitoring | i18n completeness pass — Greek-first, no gaps |
| Security pass: keys, RLS, storage policies | Map area / discovery UX refinements |

## Week 4 · Sept 25–30 — Harden and ship

| George | Margaris |
|---|---|
| Performance: markers, list virtualization, cold start | Bug bash on a real iPhone, every screen |
| App Store metadata, privacy policy, contact info | Copy pass — Greek reviewed by a native ear |
| Content-seeding tooling for Stage 3 | Empty-state and error-state design |
| **Ship TestFlight to 5–10 real testers in Ilia** | Collect and triage tester feedback |

---

## The three rules that make parallel work possible

1. **Small PRs, merged daily.** A branch alive >48h is rebuilding the last disaster.
2. **Never both in the same file.** After the split: George owns `lib/`, `supabase/`,
   `SocialMap`; Margaris owns screens, sheets, composer, i18n. Cross-boundary = ask first.
3. **CI green or it does not merge.** No exceptions, especially when moving fast.

## What speed cannot fix

- **Apple review** takes days to weeks. Get the developer account in Week 1, not Week 3.
- **Real users and partner businesses** have their own lead time. Start those conversations
  in October regardless of code state.
- **Supabase migrations** need George's explicit approval every time.

## Open decisions

- [ ] Billing model — flat monthly partnership vs. per-redemption
- [ ] Anonymous browsing: enable anonymous auth, or require an account to write
- [ ] Web build: keep at parity with iOS, or let it lag during Stage 2
