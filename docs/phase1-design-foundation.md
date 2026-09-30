# Ilia Pulse: Phase 1 design foundation

The direction is a Mediterranean field guide with live social radar: 70% calm,
20% character, 10% surprise. Phase 1 changes interface chrome only. The map,
marker identities, discovery ranking, temporal logic and detailed sheet content
remain the existing implementation.

## Inspected implementation

| Area                      | Existing architecture and Phase 1 treatment                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colors                    | `theme.css` has `hp-bg` #f6f0e6, paper #fff8ec, ink #171411, muted #7c7468, sea #7fc8de, deep #0e3a5b, olive #667a3d, sunset #e06a32 and a 10% ink border. Preserve those marker/product colors; introduce secondary/accent text variants for interface contrast. |
| Typography                | IBM Plex Sans body and IBM Plex Sans Condensed display, loaded in both entry points. Retain fonts, headings and basemap typography.                                                                                                                               |
| Spacing                   | Tailwind utilities plus component-specific CSS. Add a shared 4px scale for the touched chrome instead of replacing the application's spacing system.                                                                                                              |
| Radii / shadows           | Generic `--radius` serves shadcn; many product controls used full capsules and independent shadows. Keep shadcn defaults; add restrained product radius/elevation tokens.                                                                                         |
| Icons / buttons           | Lucide and an existing CVA/Radix Button primitive; product controls used native buttons with `hp-icon-button` CSS. Add `hpGhost` / `hpMap` and `hpIcon` variants, forwarding existing refs and native props.                                                      |
| Badges / pills            | Existing shadcn Badge and `hp-chip` product styles. Preserve non-map vibe chips and content badges; discovery lenses become text and underline controls.                                                                                                          |
| Header                    | Shared `TopBar`, appearance panel, search, Deals and `AccountBubble`. Preserve handlers and account states; remove circular utility chrome and the repeating Deals animation.                                                                                     |
| Map overlays / controls   | MapLibre public map with custom React summary, area shortcut rail, back, zoom, location, overview and licence controls. Preserve map engine, actions, labels, counts and hiding thresholds.                                                                       |
| Bottom sheet              | Custom pointer-drag sheet with ResizeObserver idle measurement and calculated peek/preview/full states. Refine only outer surface, elevation and handle; detailed contents remain intact.                                                                         |
| Bottom navigation         | Shared four-tab navigation with native buttons and selected circular icon background. Use a navigation landmark, aligned icons/text and a small selected indicator.                                                                                               |
| Themes                    | Tailwind `.dark` semantic palette and legacy `.is-night` product palette exist. Appearance currently selects language and marker animation, not light/dark. Preserve this contract; new interface text/focus tokens adapt to the existing product night palette.  |
| Responsive infrastructure | Flex app shell uses `100dvh`, 440px max width, map-area ResizeObserver and sheet-aware overlays. Define the referenced but missing safe-area and control-motion variables. Align viewport metadata across static and TanStack entries and allow browser zoom.     |

## Tokens and usage

All definitions live in the existing `theme.css`; styles remain in their existing
surface partials, imported by `styles.css`. No new stylesheet system or dependency.

- `--hp-space-1/2/3/4/6/8`: 4, 8, 12, 16, 24, 32px at the default root font size.
- `--hp-radius-control/card/surface`: 8, 12, 24px. Full rounding stays on true
  avatars, small state dots, handle marks, genuine chips and existing markers.
- `--hp-control-target`: 44px. Header utilities, Deals, discovery lenses, area
  shortcuts, map utilities, back, licence trigger and sheet snap buttons have
  actual minimum 44px targets; no overlapping pseudo-element hit areas.
- `--hp-type-control/meta/title`: 14, 12, 16px. Existing contextual headings and
  sheet contents retain their own hierarchy.
- `--hp-text-secondary`: #746c61 (4.90:1 on paper); `--hp-text-accent`: #ad471f.
  Use orange accents with a charcoal label so selection does not rely on color.
- `--hp-shadow-control/sheet/popover`: subtle elevation for map buttons, sheet
  shell and appearance panel. The navigation needs no shadow or gradient halo.
- `--hp-safe-left/right`: maximum of the 16px gutter and device safe-area inset.
  Top inset is owned by the app shell; bottom inset is owned by bottom navigation,
  not added again to the map sheet.
- `--hp-motion-state/press`: 160 / 90ms; `--hp-ease-standard`: existing ease-out
  curve. Existing reduced-motion rules and marker animation profiles are retained.
- `--hp-focus-color`: deep blue on light surfaces, sea blue in the existing product night
  scope. One base outline rule replaces conflicting focus overrides for touched
  controls; existing content-specific focus rules remain out of scope.

The shared header and navigation change on every tab. Only map discovery lenses
change to text filters. The area shortcut rail has one shared translucent backing;
individual shortcuts have no capsule faces. An active shortcut uses a subdued
orange tint and underline. The summary keeps its text on a small, gently backed
surface. Map utility groups retain their right-hand placement with 8px corners.

## Responsive compromises and boundaries

The app remains a phone-width interface on desktop. Container queries use the
actual app width: below 360px Deals shows the gift icon with its accessible name;
360–389px uses 12px Deals text and tighter utility spacing for Greek labels. Header
rows may wrap when enlarged text needs more room; no control is removed.

The appearance button retains marker animation previews. There is no new dark
mode control, font, marker system, time-of-day atmosphere or regional discovery
architecture. No authentication, payment, data-access, persistence or backend
contract changes. Account styling preserves anonymous, loading, initials, avatar
and incomplete-profile states. Existing map geolocation permission/error behavior
is preserved.

## Verification

Both the static production preview and development entry render the map. Browser
checks cover 320, 360, 390 and 430px widths, a 360×640 viewport, Greek/English
labels, filter overflow and actual 44px control rectangles. At 844px viewport
height the sheet and navigation meet at 774.6px without overlap. All five lenses
select singly and clear on repeat selection; search matches and its empty state
work. Map/Pulse/Routes/Meet and Deals render their destinations. Area and place
selection, back, zoom, overview, attribution, profile entry, appearance selection,
Escape focus return, sheet snaps and pointer dragging were exercised. Location
request failure retains the existing console warning without breaking the map.

Interaction verification caught the existing icon-button positioning overriding
the map back button's Tailwind absolute utility. Its owning map class now declares
absolute positioning, keeping the target above the sheet. Keyboard verification
also confirmed the focus rule must be unlayered so scrolling rails can inset it.

Typecheck, lint, intelligence (8), discovery (9), routing (5), secret tests (4),
map-visual contracts, secret scan and production build pass. Lint retains three
baseline warnings; the build retains its large-chunk warning. The map's imagery,
ranking and animation regression suites continue unchanged.
Device geolocation success, iOS physical safe areas and OS reduced-motion/text-size
settings need device-specific verification in addition to browser inspection.

Remaining legacy styles in feed cards, content badges, sheet contents, onboarding
and administrative screens are intentionally outside this phase. Repeated basemap
and marker CSS is not rewritten as part of interface chrome cleanup.

## Runtime issue found during verification

The inspected MapLibre 6 build did not emit its module worker, leaving the map
waiting for initialization despite a passing build. SocialMap now explicitly
imports the worker with Vite's `?worker&url` pipeline and supplies that URL before
map creation, following [MapLibre's Vite installation recipe](https://maplibre.org/maplibre-gl-js/docs/).
This bundles the worker with its shared imports; no map behavior, dependency
version, engine, markers or discovery logic changes. The isolated worktree uses
its own dependency installation because symlinked dependencies fall outside
Vite's worker-serving allow list.

## Exact Phase 1 file manifest

Created: `docs/phase1-design-foundation.md`.

Modified:

- `cloudflare-static-src/index.html`
- `src/components/hp/AuthAccountSheets.tsx`
- `src/components/hp/BottomNav.tsx`
- `src/components/hp/MapBottomSheet.tsx`
- `src/components/hp/PulseTopBar.tsx`
- `src/components/hp/SocialMap.tsx`
- `src/components/ui/button.tsx`
- `src/lib/i18n.tsx`
- `src/routes/__root.tsx`
- `src/styles/base.css`
- `src/styles/controls.css`
- `src/styles/deals.css`
- `src/styles/engagement.css`
- `src/styles/map-base.css`
- `src/styles/map-chrome.css`
- `src/styles/shell.css`
- `src/styles/theme.css`
- `src/styles/utilities.css`
