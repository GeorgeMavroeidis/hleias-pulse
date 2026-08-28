/**
 * Business Profile domain types (stage B1).
 *
 * A "business" is a verified account (same review flow as an Organizer) that can
 * claim ONE existing place and enrich its public profile. No commerce here --
 * deals and coupons are later, separate stages.
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

/** Editable enrichment fields for a claimed place (all free-text in v1). */
export interface PlaceBusinessProfileFields {
  hoursText: string | null;
  phone: string | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  photos: string[];
}

/** A claim row as the owning business sees it (any status). */
export interface PlaceClaim extends PlaceBusinessProfileFields {
  id: string;
  placeId: string;
  businessId: string;
  status: PlaceClaimStatus;
}

/** The public, approved-only view shown inside a place detail. */
export interface PlaceBusinessProfile extends PlaceBusinessProfileFields {
  placeId: string;
  businessName: string;
}

export const DEFAULT_BUSINESS_BIO = "Local business in Ilia.";
