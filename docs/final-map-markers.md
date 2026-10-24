# Final map-marker design pass

Base: `feat/reliability-current-discovery` at
`ab1a9b3cb1e9bd7e5f4b8590bf4cf3b1e6279ebd`, including the later integrated
appearance, recovery and selection fixes. The original Phase 7 branch is a
historical reference. Implementation is isolated on `feat/final-map-markers`;
the primary checkout's branch, index and dirty files are preserved.

## Behavior

- Ordinary places retain their Stage 7 14–16px coral dot and 44px hit target.
  Explicit place selection or keyboard focus reveals a centered 32px circular
  photo, a 1.5px ivory rim (`--hp-on-media`) and a subtle coral halo. Keyboard
  focus retains its contrasting outline. Selecting a one-place region alone
  keeps the dot, even when the existing renderer highlights that child.
- The source is the existing `Place.imageUrl` (`places.image_url`), also used by
  the discovery sheet. A per-marker controller assigns `img.src` only on
  selection or keyboard focus. Browser caching reuses previously loaded images.
  Empty URLs, network failures and zero-pixel loads keep the dot. Failed sources
  are remembered for that marker's lifetime. No replacement stock photo,
  thumbnail batch, API change or dependency is introduced.
- Loading changes only the marker's existing DOM. The dot remains underneath
  until success; blur/deselection hides the photo. Source replacement, marker
  exit and map teardown detach callbacks and listeners, so stale completion
  cannot reveal an inactive or removed photo. Reappearing markers regain a fresh
  controller through the existing exit/reappearance path.
- Focus does not select or change the sheet. Enter/Space, pressed state, labels,
  selection/Back history and the existing camera behavior remain. The photo is
  decorative (`alt=""`, `aria-hidden="true"`). Story/event cues remain visible
  outside its edge. Cluster number badges, regions, route stops and the user
  marker retain their existing rendering.
- The photo uses the existing short opacity transition; reduced motion makes
  it effectively immediate and disables decorative rings. Light/Dark colors and
  Pulse/Calm remain under their existing owners. No map/index rebuild, refresh
  owner, timer, schema change, merge or deployment is part of this pass.

## Acceptance — 23–24 October 2026

The guarded release-entry static build ran at `http://127.0.0.1:4183/` against
the existing local stack. Captured API traffic targeted loopback port 54321.
The separate fictional preview ran at port 5183 with the fixed clock
`2026-10-05T15:00:00.000Z`. The static entry does not mount that preview query;
both entry paths were checked. No test accounts/content were created or reset.
Capture dimensions were checked against both the DOM viewport and saved image pixels.

| Check                                                                               | Result                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Desktop 1440×900 and mobile 390×844, Light and Dark                                 | PASS; four selected-photo screenshots                                                                                          |
| Ordinary dots / numbered clusters                                                   | PASS; six 14px dots had no marker images; badges 4/2 expanded into place dots                                                  |
| Keyboard / accessibility / sheets                                                   | PASS; GR/EN labels, Tab preview, blur, Enter/Space, place sheet, Back and appearance-menu Escape                               |
| Delayed image then blur                                                             | PASS; dot while pending, late success stayed hidden; canvas and marker DOM identity unchanged                                  |
| Failed image / reselection / evidence update                                        | PASS; selected dot retained, failed marker creates no new image; existing sheet may retry when remounted                       |
| Reduced motion / Pulse / Calm                                                       | PASS; 44px target, 32px photo, ivory rim in both themes; reduced transition 0.01ms under global override, ring animations none |
| Pan / zoom / appearance stability                                                   | PASS; keyboard panning, zoom controls and theme changes preserve canvas, selected marker and sheet                             |
| Empty/changed sources, stale callbacks, teardown/reappearance, 500 inactive markers | PASS; focused lifecycle tests                                                                                                  |

Offline checks passed: `test:current-map` (39, including eight new photo tests),
`test:map-cartography` (23), `test:motion` (2), `test:current-discovery` (63),
`test:map-recovery` (22), `test:theme` (16), `test:discovery`, `test:routing` (9),
map visual contracts, both TypeScript projects, source/built-output secret scans,
production and guarded local-test builds, formatting and diff checks. Lint has
zero errors and four existing warnings in unchanged files. Existing bundle-size
and mixed static/dynamic-import build warnings remain.

Runtime captures, lifecycle observations and check logs are saved outside source
in the sibling `marker-acceptance/` evidence directory, with a manifest of the
reviewed code and primary-checkout fingerprints. Physical-device and ordinary
Safari/Firefox acceptance remain part of the broader integration handoff; this
Chromium viewport pass does not claim them. The marker design is final; remaining
work is review/integration and that existing compatibility acceptance queue.
