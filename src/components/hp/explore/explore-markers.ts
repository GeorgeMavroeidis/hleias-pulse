import type { PlaceType } from "@/lib/hp-model";
import { thumbnailUrl, type ExploreMedia } from "@/lib/hp/explore-media";

/**
 * DOM builders for Explore map markers. MapLibre positions the outer element
 * with a CSS transform, so every visual (scale, lift, entrance) is animated on
 * an inner element — animating the outer one would fight the map.
 */

export type MarkerVisualState = "idle" | "focused" | "selected" | "dimmed";

/** Lucide icon geometry (ISC licence), inlined so markers need no React. */
const TYPE_ICON: Record<PlaceType, string> = {
  beach:
    '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  culture:
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  nature:
    '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  local:
    '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  village:
    '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  night: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sunset:
    '<path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
};

export function typeIconSvg(type: PlaceType, size = 12) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TYPE_ICON[type] ?? TYPE_ICON.local}</svg>`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** A photo that fades in once decoded and hides itself if the source fails. */
function photo(className: string, width: number) {
  const frame = el("span", className);
  const img = el("img", "xp-img");
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.setAttribute("aria-hidden", "true");
  img.onload = () => frame.classList.add("is-loaded");
  img.onerror = () => frame.classList.add("is-failed");
  frame.append(img);
  let current = "";
  return {
    frame,
    set(src: string | undefined) {
      const next = src ? thumbnailUrl(src, width) : "";
      if (next === current) return;
      current = next;
      frame.classList.remove("is-loaded", "is-failed");
      if (next) img.src = next;
      else img.removeAttribute("src");
    },
  };
}

export type AreaMarkerData = {
  id: string;
  name: string;
  count: number;
  cover?: string;
  behind?: string[];
  hasStories: boolean;
  hot: boolean;
  state: MarkerVisualState;
  /** Overlaps a higher-ranked area at this zoom: shown as a small photo dot. */
  collapsed?: boolean;
};

export function createAreaMarker(onActivate: () => void) {
  const element = el("div", "xp-marker xp-marker--area");
  const button = el("button", "xp-area");
  button.type = "button";
  const stack = el("span", "xp-area__stack");
  const back2 = photo("xp-area__card xp-area__card--2", 120);
  const back1 = photo("xp-area__card xp-area__card--1", 120);
  const front = photo("xp-area__photo", 250);
  const ring = el("span", "xp-ring");
  const count = el("span", "xp-area__count");
  const label = el("span", "xp-area__label");
  stack.append(back2.frame, back1.frame, ring, front.frame, count);
  button.append(stack, label);
  element.append(button);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onActivate();
  });
  return {
    element,
    update(data: AreaMarkerData) {
      front.set(data.cover);
      back1.set(data.behind?.[0] ?? data.cover);
      back2.set(data.behind?.[1] ?? data.behind?.[0] ?? data.cover);
      count.textContent = String(data.count);
      label.textContent = data.name;
      button.dataset.state = data.state;
      button.dataset.story = data.hasStories ? "true" : "false";
      button.dataset.hot = data.hot ? "true" : "false";
      button.dataset.collapsed = data.collapsed ? "true" : "false";
      button.setAttribute("aria-label", `${data.name}, ${data.count}`);
      element.style.zIndex =
        data.state === "focused" ? "40" : data.collapsed ? "5" : data.hot ? "12" : "10";
    },
  };
}

export type PlaceMarkerData = {
  id: string;
  name: string;
  type: PlaceType;
  cover?: string;
  fan?: string[];
  /** Selected place only: photos that bloom out in an arc around the pin. */
  halo?: { id: string; url: string }[];
  hasStories: boolean;
  live: boolean;
  state: MarkerVisualState;
  showLabel: boolean;
  ariaLabel: string;
};

const HALO_SLOTS = 5;

export function createPlaceMarker(onActivate: () => void, onHalo?: (id: string) => void) {
  const element = el("div", "xp-marker xp-marker--place");
  const button = el("button", "xp-pin");
  button.type = "button";
  const body = el("span", "xp-pin__body");
  const fan = el("span", "xp-pin__fan");
  const fanPhotos = [photo("xp-fan xp-fan--1", 250), photo("xp-fan xp-fan--2", 250)];
  fan.append(...fanPhotos.map((item) => item.frame));
  const ring = el("span", "xp-ring");
  const main = photo("xp-pin__photo", 250);
  const badge = el("span", "xp-pin__badge");
  const live = el("span", "xp-pin__live");
  const tail = el("span", "xp-pin__tail");
  const label = el("span", "xp-pin__label");
  body.append(fan, ring, main.frame, badge, live, tail);
  button.append(body, label);
  const halo = el("span", "xp-halo");
  const haloSlots = Array.from({ length: HALO_SLOTS }, (_, index) => {
    const slot = el("button", "xp-halo__photo");
    slot.type = "button";
    slot.style.setProperty("--i", String(index));
    const frame = photo("xp-halo__frame", 250);
    slot.append(frame.frame);
    let id = "";
    slot.addEventListener("click", (event) => {
      event.stopPropagation();
      if (id) onHalo?.(id);
    });
    halo.append(slot);
    return {
      set(item: { id: string; url: string } | undefined) {
        id = item?.id ?? "";
        slot.hidden = !item;
        frame.set(item?.url);
      },
    };
  });
  element.append(button, halo);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onActivate();
  });
  let lastType: PlaceType | null = null;
  return {
    element,
    update(data: PlaceMarkerData) {
      main.set(data.cover);
      fanPhotos.forEach((item, index) => item.set(data.fan?.[index]));
      button.dataset.fan = String(Math.min(2, data.fan?.length ?? 0));
      const haloItems = data.state === "selected" ? (data.halo ?? []).slice(0, HALO_SLOTS) : [];
      haloSlots.forEach((slot, index) => slot.set(haloItems[index]));
      halo.dataset.count = String(haloItems.length);
      element.dataset.halo = haloItems.length ? "true" : "false";
      if (lastType !== data.type) {
        badge.innerHTML = typeIconSvg(data.type, 11);
        badge.dataset.type = data.type;
        lastType = data.type;
      }
      label.textContent = data.name;
      button.dataset.state = data.state;
      button.dataset.story = data.hasStories ? "true" : "false";
      button.dataset.live = data.live ? "true" : "false";
      button.dataset.label = data.showLabel ? "true" : "false";
      button.setAttribute("aria-label", data.ariaLabel);
      button.setAttribute("aria-pressed", data.state === "selected" ? "true" : "false");
      element.style.zIndex =
        data.state === "selected"
          ? "60"
          : data.state === "focused"
            ? "50"
            : data.live
              ? "22"
              : "20";
    },
  };
}

export type ClusterMarkerData = {
  count: number;
  covers: string[];
  hasStories: boolean;
  ariaLabel: string;
};

export function createClusterMarker(onActivate: () => void) {
  const element = el("div", "xp-marker xp-marker--cluster");
  const button = el("button", "xp-cluster");
  button.type = "button";
  const back = photo("xp-cluster__photo xp-cluster__photo--back", 120);
  const ring = el("span", "xp-ring");
  const front = photo("xp-cluster__photo", 250);
  const count = el("span", "xp-cluster__count");
  button.append(back.frame, ring, front.frame, count);
  element.append(button);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onActivate();
  });
  return {
    element,
    update(data: ClusterMarkerData) {
      front.set(data.covers[0]);
      back.set(data.covers[1] ?? data.covers[0]);
      count.textContent = data.count > 99 ? "99+" : String(data.count);
      button.dataset.story = data.hasStories ? "true" : "false";
      button.setAttribute("aria-label", data.ariaLabel);
    },
  };
}

/** Photos taken at one spot near the selected place, pinned exactly there. */
export function createBloomMarker(
  media: ExploreMedia,
  count: number,
  index: number,
  onActivate: () => void,
) {
  const element = el("div", "xp-marker xp-marker--bloom");
  const button = el("button", "xp-bloom");
  button.type = "button";
  button.style.setProperty("--i", String(index));
  button.style.setProperty("--tilt", `${(index % 2 === 0 ? -1 : 1) * (3 + (index % 3) * 2)}deg`);
  const frame = photo("xp-bloom__photo", 250);
  frame.set(media.url);
  button.append(frame.frame);
  if (count > 1) {
    const badge = el("span", "xp-bloom__count");
    badge.textContent = count > 99 ? "99+" : String(count);
    button.append(badge);
  }
  button.setAttribute("aria-label", media.caption ? `Photo: ${media.caption}` : "Photo");
  element.append(button);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onActivate();
  });
  return element;
}

export function createUserMarker() {
  const element = el("div", "xp-marker xp-user");
  element.append(el("span", "xp-user__halo"), el("span", "xp-user__dot"));
  return element;
}

export function createRouteStopMarker(index: number, label: string) {
  const element = el("div", "xp-marker xp-route-stop");
  const badge = el("span", "xp-route-stop__badge");
  badge.textContent = String(index + 1);
  badge.title = label;
  element.append(badge);
  return element;
}
