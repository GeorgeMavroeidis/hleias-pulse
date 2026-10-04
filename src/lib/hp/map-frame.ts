/** Coalesce viewport events and make a queued frame inert when the map unmounts. */
export function createMapFrame(
  update: () => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
) {
  let frame: number | null = null;
  let disposed = false;
  return {
    schedule() {
      if (disposed || frame !== null) return;
      frame = request(() => {
        frame = null;
        if (!disposed) update();
      });
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancel(frame);
      frame = null;
    },
  };
}
