/**
 * Business Profile domain types (stages B1 + B2).
 *
 * B1: a "business" is a verified account (same review flow as an Organizer) that
 * can claim ONE existing place and enrich its public profile.
 * B2: a verified business with an approved claim can attach ONE free-text
 * "static deal" to that place (deal_text / deal_active). No commerce, no
 * redemption tracking -- the owner checks it manually.
 */

export type BusinessVerificationStatus = "pending" | "verified" | "rejected";

export type PlaceClaimStatus = "pending" | "approved" | "rejected";

export interface BusinessStatus {
  id: string;
  displayName: string;
  bio: string;
  contactPhone: string | null;
  contactEmail: string | null;
  verificationStatus: BusinessVerificationStatus;
}

/**
 * Enrichment fields the owning business edits WHILE the claim is pending. The
 * B2 deal (dealText / dealActive) is deliberately NOT here: it has its own
 * write path (set_place_deal RPC) that stays open after approval.
 */
export interface PlaceBusinessProfileFields {
  hoursText: string | null;
  phone: string | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  photos: string[];
}

/** The single static deal on an approved claim (stage B2). */
export interface PlaceDeal {
  dealText: string | null;
  dealActive: boolean;
}

/** A claim row as the owning business sees it (any status). */
export interface PlaceClaim extends PlaceBusinessProfileFields, PlaceDeal {
  id: string;
  placeId: string;
  businessId: string;
  status: PlaceClaimStatus;
}

/** The public, approved-only view shown inside a place detail. */
export interface PlaceBusinessProfile extends PlaceBusinessProfileFields, PlaceDeal {
  placeId: string;
  businessName: string;
}

export const DEFAULT_BUSINESS_BIO = "Local business in Ilia.";
export const DEAL_TEXT_MAX_LENGTH = 140;
