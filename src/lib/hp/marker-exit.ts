import { HP_MOTION } from "./motion";

/** A single timeout services all exiting markers. Reappearing IDs keep their DOM. */
export function createMarkerExits(
  schedule: (run: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
  now: () => number = Date.now,
) {
  const pending = new Map<string, { at: number; remove: () => void }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    if (!pending.size) return;
    const next = Math.min(...[...pending.values()].map((entry) => entry.at));
    timer = schedule(
      () => {
        timer = undefined;
        const time = now();
        for (const [id, entry] of pending) {
          if (entry.at > time) continue;
          pending.delete(id);
          entry.remove();
        }
        arm();
      },
      Math.max(0, next - now()),
    );
  };
  return {
    has: (id: string) => pending.has(id),
    start(id: string, remove: () => void) {
      if (pending.has(id)) return;
      pending.set(id, { at: now() + HP_MOTION.state, remove });
      if (timer === undefined) arm();
    },
    cancel(id: string) {
      if (!pending.delete(id)) return false;
      if (!pending.size && timer !== undefined) {
        cancel(timer);
        timer = undefined;
      }
      return true;
    },
    flush() {
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      const entries = [...pending.values()];
      pending.clear();
      entries.forEach((entry) => entry.remove());
    },
  };
}
