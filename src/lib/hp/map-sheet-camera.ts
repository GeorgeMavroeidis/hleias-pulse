export type SafeMapRect = { left: number; right: number; top: number; bottom: number };
export function discoverySafeMapRect(
  width: number,
  height: number,
  overlayHeight: number,
  markerRadius = 48,
): SafeMapRect {
  const availableHeight = Math.max(1, height - overlayHeight);
  const railVisible = availableHeight >= 248;
  const chromeVisible = availableHeight >= 188;
  const margin = Math.min(20, availableHeight / 4);
  const radius = Math.min(markerRadius, Math.max(0, (availableHeight - 2 * margin - 32) / 2));
  const edgeInset = margin + radius;
  const rawBottom = availableHeight - margin - radius;
  const minimumHeight = Math.min(32, rawBottom - edgeInset);
  const desiredTop = (chromeVisible ? 108 : margin) + radius;
  const top = Math.max(edgeInset, Math.min(desiredTop, rawBottom - minimumHeight));
  return {
    left: edgeInset,
    right: Math.max(edgeInset + 32, width - (railVisible ? 64 : 20) - radius),
    top,
    bottom: rawBottom,
  };
}
export function panDeltaIntoSafeRect(point: { x: number; y: number }, rect: SafeMapRect) {
  return {
    x: point.x < rect.left ? point.x - rect.left : point.x > rect.right ? point.x - rect.right : 0,
    y: point.y < rect.top ? point.y - rect.top : point.y > rect.bottom ? point.y - rect.bottom : 0,
  };
}
export function pointIsInSafeRect(point: { x: number; y: number }, rect: SafeMapRect) {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}
