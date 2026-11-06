/**
 * Map bubbles are 44px wide. Wikimedia serves fixed thumbnail widths, so ask for the
 * 120px one (3–6 KB) instead of the 1280px or original file (100–450 KB).
 */
export function bubblePhotoUrl(url: string | null | undefined) {
  const source = url?.trim() ?? "";
  const thumb = source.match(
    /^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/.+\/thumb\/.+\/)\d+px-([^/]+)$/,
  );
  if (thumb) return `${thumb[1]}120px-${thumb[2]}`;
  const original = source.match(
    /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/)([0-9a-f]\/[0-9a-f]{2}\/)([^/]+\.(?:jpe?g|png|webp))$/i,
  );
  if (original) return `${original[1]}thumb/${original[2]}${original[3]}/120px-${original[3]}`;
  return source;
}

/** At most this many place photos show at once; every other place stays a dot. */
export const MAX_MARKER_PHOTOS = 12;

type PhotoCandidate = {
  id: string;
  opacity: number;
  selected: boolean;
  prominence: { score: number };
  place: { hotness: number; imageUrl?: string | null };
};

/** Visible places that show their photo: the selected one, then the most prominent. */
export function markerPhotoIds(nodes: readonly PhotoCandidate[], limit = MAX_MARKER_PHOTOS) {
  return new Set(
    nodes
      .filter((node) => node.opacity > 0.08 && node.place.imageUrl?.trim())
      .sort(
        (a, b) =>
          Number(b.selected) - Number(a.selected) ||
          b.prominence.score - a.prominence.score ||
          b.place.hotness - a.place.hotness ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map((node) => node.id),
  );
}

/** A marker owns its photo; loading never publishes React or map state. */
export function createMarkerPhoto(element: HTMLElement) {
  const shell = element.firstElementChild as HTMLElement;
  const failedSources = new Set<string>();
  let source = "";
  let selected = false;
  let keyboardFocused = false;
  let image: HTMLImageElement | null = null;
  let loaded = false;
  let disposed = false;

  const show = () => {
    shell.classList.toggle("has-place-photo", loaded && (selected || keyboardFocused));
  };
  const clearImage = () => {
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      image.remove();
      image = null;
    }
    loaded = false;
    show();
  };
  const sync = () => {
    if (disposed) return;
    if ((selected || keyboardFocused) && source && !image && !failedSources.has(source)) {
      const pending = element.ownerDocument.createElement("img");
      const pendingSource = source;
      pending.className = "hp-pulse-photo";
      pending.alt = "";
      pending.setAttribute("aria-hidden", "true");
      pending.draggable = false;
      pending.decoding = "async";
      pending.width = 32;
      pending.height = 32;
      image = pending;
      const fail = () => {
        if (disposed || image !== pending) return;
        failedSources.add(pendingSource);
        clearImage();
      };
      pending.onerror = fail;
      pending.onload = () => {
        if (disposed || image !== pending) return;
        if (!pending.naturalWidth) return fail();
        loaded = true;
        show();
      };
      shell.insertBefore(pending, shell.querySelector(".hp-pulse-event"));
      // No src exists until the caller activates this marker or it gets keyboard focus.
      pending.src = source;
    }
    show();
  };
  const focus = () => {
    keyboardFocused = element.matches(":focus-visible");
    sync();
  };
  const blur = () => {
    keyboardFocused = false;
    sync();
  };
  element.addEventListener("focus", focus);
  element.addEventListener("blur", blur);

  return {
    update(nextSource: string | null | undefined, nextSelected: boolean) {
      if (disposed) return;
      selected = nextSelected;
      const normalized = nextSource?.trim() ?? "";
      if (source !== normalized) {
        source = normalized;
        clearImage();
      }
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      selected = false;
      keyboardFocused = false;
      element.removeEventListener("focus", focus);
      element.removeEventListener("blur", blur);
      clearImage();
      failedSources.clear();
    },
  };
}
