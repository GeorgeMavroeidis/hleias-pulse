/** Live presentation geometry, independent of React selection state. */
export type SheetGeometrySnapshot = { height: number; moving: boolean };
export function createSheetGeometry(height = 72) {
  let current: SheetGeometrySnapshot = { height, moving: false };
  const listeners = new Set<(value: SheetGeometrySnapshot) => void>();
  return {
    get: () => current,
    set(next: SheetGeometrySnapshot) {
      if (next.height === current.height && next.moving === current.moving) return;
      current = next;
      listeners.forEach((listener) => listener(current));
    },
    subscribe(listener: (value: SheetGeometrySnapshot) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type SheetGeometry = ReturnType<typeof createSheetGeometry>;
