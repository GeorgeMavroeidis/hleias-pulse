/**
 * Best-effort "offer size" for the wax-stamp seal on deal coupons. A real
 * implementation would carry this as a structured field on the deal; here we
 * sniff the free-text. Returns null when nothing recognisable is found (the
 * seal is then hidden).
 */
export function dealSealValue(dealText: string): { big: string; small?: string } | null {
  const pct = dealText.match(/(\d{1,2})\s*%/);
  if (pct) return { big: `−${pct[1]}%` };
  if (
    /1\s*\+\s*1|\b2\b[^\d]{0,10}\b1\b|(2ος|2nd|2η|second).{0,20}(δωρε|δώρο|free|gratis)|buy\s*one\s*get\s*one/i.test(
      dealText,
    )
  ) {
    return { big: "2·1", small: "ΔΩΡΟ" };
  }
  return null;
}
