import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function secretsMatch(expected: string, candidate: string | null): boolean {
  if (!expected || !candidate) return false;
  return timingSafeEqual(digest(expected), digest(candidate));
}
