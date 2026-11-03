/** A place marker owns its photo; loading never publishes React or map state. */
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
      // No src exists until this particular place is selected or keyboard-focused.
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
