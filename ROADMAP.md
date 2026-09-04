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

**Status as of 5 Sept — Mavroeidis track is ~70% done, Margaris track not started.**

### Done

| | What | Where |
|---|---|---|
| ✅ | **The core loop works.** Posting, commenting, places, stories and meet events all failed with `42501`. Root cause was not the write but the `.insert().select()` read-back: no SELECT policy let an author see their own `pending` row. | PR #27 |
| ✅ | **Map renders again.** CARTO began serving "API KEY REQUIRED" watermark tiles with HTTP 200. Now keyless OSM, overridable via `VITE_MAP_TILE_URL`. | PR #29 |
| ✅ | **CI on every PR** — lint, typecheck, three suites, production build. There was none before. | PR #26 |
| ✅ | **Migration history repaired.** All 20 migrations had been hand-pasted and were untracked, which is why #24090000 landed half-applied and broke posting for weeks. Duplicate version number also fixed. | PR #28 |
| ✅ | **Image URLs made CORS-safe.** `Special:FilePath` sends no ACAO header, so the thumbnail cache never worked and full 1200–2000px originals were downloaded for 48px markers. | PR #30 |
| ✅ | `ROADMAP.md` + `CLAUDE.md`, ownership lanes, CODEOWNERS | PR #24, #31 |
| ✅ | All three branches synced; `main` is the single source of truth | — |

### Not done

| | What | Owner |
|---|---|---|
| ⬜ | **Report / block / mute.** Apple Guideline 1.2 — guaranteed rejection without it. All new files. | **Margaris** |
| ⬜ | **Accounts-required flow.** Decision made: no anonymous posting. 24 write paths must open the sign-in sheet instead of throwing a raw `AuthApiError`. | Mavroeidis |
| ⬜ | **Split `PulseApp.tsx`** (7,011 lines) and `styles.css` (3,967). The gate before two people can work in parallel. | Mavroeidis |
| ⬜ | **Apply the image migration.** `20260904210000` is merged but not run against the database. | Mavroeidis |
| ⬜ | **Branch protection** on `main` + require Code Owner review. Without it CI and CODEOWNERS are advisory. | Mavroeidis |
| ⬜ | `/ship` git automation · repoint the two stale smoke scripts · delete ~15 audit accounts · fix the "roday" typo | Mavroeidis |

> **Gate still stands:** Week 2 does not start until `PulseApp.tsx` is split and CI is enforced.

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
