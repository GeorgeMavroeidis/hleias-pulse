import assert from "node:assert/strict";
import test from "node:test";
import { createMarkerPhoto } from "./marker-photo";

// A controllable DOM boundary keeps network completion order explicit in these tests.
class PhotoImage {
  className = "";
  alt = "";
  draggable = true;
  decoding = "auto";
  width = 0;
  height = 0;
  naturalWidth = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  attributes = new Map<string, string>();
  requests: string[] = [];
  removed = false;
  set src(value: string) {
    this.requests.push(value);
    this.attributes.set("src", value);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  remove() {
    this.removed = true;
  }
  load() {
    this.naturalWidth = 100;
    this.onload?.(new Event("load"));
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

function fixture() {
  const classes = new Set<string>();
  const images: PhotoImage[] = [];
  const inserted: PhotoImage[] = [];
  const shell = {
    classList: {
      toggle(name: string, enabled: boolean) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    querySelector: () => null,
    insertBefore: (image: PhotoImage) => inserted.push(image),
  };
  class Marker extends EventTarget {
    firstElementChild = shell;
    focusVisible = true;
    ownerDocument = {
      createElement(tag: string) {
        assert.equal(tag, "img");
        const image = new PhotoImage();
        images.push(image);
        return image;
      },
    };
    matches(selector: string) {
      assert.equal(selector, ":focus-visible");
      return this.focusVisible;
    }
  }
  const marker = new Marker();
  const photo = createMarkerPhoto(marker as unknown as HTMLElement);
  const shown = () => classes.has("has-place-photo");
  return { photo, marker, images, inserted, shown };
}

test("500 ordinary place markers request no photos, including on metadata updates", () => {
  for (let i = 0; i < 500; i++) {
    const { photo, images, shown } = fixture();
    photo.update(`/place-${i}.jpg`, false);
    photo.update(`/updated-place-${i}.jpg`, false);
    assert.equal(images.length, 0);
    assert.equal(shown(), false);
    photo.dispose();
  }
});

test("selection keeps the dot until success and reuses the image across repeated updates", () => {
  const { photo, images, inserted, shown } = fixture();
  photo.update(" /place.jpg ", true);
  const image = images[0];
  assert.equal(shown(), false);
  assert.deepEqual(image.requests, ["/place.jpg"]);
  assert.equal(image.alt, "");
  assert.equal(image.attributes.get("aria-hidden"), "true");
  assert.equal(image.decoding, "async");
  assert.equal(image.draggable, false);
  assert.deepEqual([image.width, image.height], [32, 32]);
  image.load();
  assert.equal(shown(), true);
  photo.update("/place.jpg", true);
  photo.update("/place.jpg", false);
  assert.equal(shown(), false);
  photo.update("/place.jpg", true);
  assert.equal(shown(), true);
  assert.deepEqual(inserted, [image]);
  assert.equal(images.length, 1);
  assert.deepEqual(image.requests, ["/place.jpg"]);
});

test("keyboard focus previews without selecting; blur hides unless selection remains", () => {
  const { photo, marker, images, shown } = fixture();
  photo.update("/place.jpg", false);
  marker.dispatchEvent(new Event("focus"));
  images[0].load();
  assert.equal(shown(), true);
  marker.dispatchEvent(new Event("blur"));
  assert.equal(shown(), false);
  photo.update("/place.jpg", true);
  marker.dispatchEvent(new Event("focus"));
  marker.dispatchEvent(new Event("blur"));
  assert.equal(shown(), true);
  photo.update("/place.jpg", false);
  assert.equal(shown(), false);
});

test("pointer hover and pointer focus request no photo", () => {
  const { photo, marker, images } = fixture();
  photo.update("/place.jpg", false);
  marker.dispatchEvent(new Event("mouseenter"));
  marker.focusVisible = false;
  marker.dispatchEvent(new Event("focus"));
  assert.equal(images.length, 0);
});

test("empty sources and load/decode failures keep the dot without retry storms", () => {
  const { photo, marker, images, shown } = fixture();
  for (const empty of [undefined, null, "", "  "]) photo.update(empty, true);
  assert.equal(images.length, 0);
  photo.update("/broken.jpg", true);
  images[0].fail();
  assert.equal(images[0].removed, true);
  assert.equal(shown(), false);
  photo.update("/broken.jpg", false);
  marker.dispatchEvent(new Event("focus"));
  photo.update("/broken.jpg", true);
  assert.equal(images.length, 1);
  photo.update("/zero-pixels.jpg", true);
  images[1].onload?.(new Event("load"));
  assert.equal(shown(), false);
  photo.update("/working.jpg", true);
  images[2].load();
  assert.equal(shown(), true);
  photo.update("/broken.jpg", true);
  assert.equal(images.length, 3);
  assert.equal(shown(), false);
});

test("late loads after blur or deselection never reveal an inactive photo", () => {
  for (const keyboard of [false, true]) {
    const { photo, marker, images, shown } = fixture();
    photo.update("/slow.jpg", !keyboard);
    if (keyboard) marker.dispatchEvent(new Event("focus"));
    photo.update("/slow.jpg", false);
    marker.dispatchEvent(new Event("blur"));
    images[0].load();
    assert.equal(shown(), false);
    photo.update("/slow.jpg", true);
    assert.equal(shown(), true);
  }
});

test("source changes reject stale success and failure callbacks", () => {
  const { photo, images, shown } = fixture();
  photo.update("/old.jpg", true);
  const lateLoad = images[0].onload!;
  const lateFailure = images[0].onerror!;
  images[0].naturalWidth = 100;
  photo.update("/new.jpg", true);
  assert.equal(images[0].removed, true);
  assert.equal(images[0].attributes.has("src"), false);
  lateLoad(new Event("load"));
  lateFailure(new Event("error"));
  assert.equal(shown(), false);
  images[1].load();
  assert.equal(shown(), true);
  photo.update("", true);
  assert.equal(shown(), false);
  assert.equal(images[1].removed, true);
});

test("teardown detaches listeners and callbacks; reappearing markers can load again", () => {
  const { photo, marker, images, shown } = fixture();
  photo.update("/pending.jpg", true);
  const lateLoad = images[0].onload!;
  images[0].naturalWidth = 100;
  photo.dispose();
  photo.dispose();
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
  assert.equal(images[0].removed, true);
  lateLoad(new Event("load"));
  marker.dispatchEvent(new Event("focus"));
  photo.update("/ignored.jpg", true);
  assert.equal(shown(), false);
  assert.equal(images.length, 1);
  const reappeared = createMarkerPhoto(marker as unknown as HTMLElement);
  reappeared.update("/pending.jpg", true);
  images[1].load();
  assert.equal(shown(), true);
  reappeared.dispose();
});
