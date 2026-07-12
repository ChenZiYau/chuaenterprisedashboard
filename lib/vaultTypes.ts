/**
 * Types mirroring the Image Vault's stored data (chua-image-vault
 * lib/types.ts) — keep the two in sync if the vault's shape ever changes.
 */

/** A single image entry stored for a property. */
export interface ImageEntry {
  /** Stable client-generated id for list reconciliation. */
  id: string;
  title: string;
  description: string;
  /** Public Vercel Blob URL of the image actually displayed (possibly cropped). */
  imageUrl: string;
  /**
   * Public Blob URL of the un-cropped original, so re-cropping always starts
   * from full resolution. Equals `imageUrl` when the image was never cropped.
   */
  originalUrl: string;
  /** Optional record of the last applied crop (in natural pixels). */
  crop?: CropInfo | null;
  /** ISO timestamp of last update. */
  updatedAt: string;
}

/** Crop geometry expressed in the original image's natural pixels. */
export interface CropInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Aspect preset that produced the crop, for UI restoration. */
  aspect: AspectPreset;
}

export type AspectPreset = "1:1" | "4:3" | "16:9" | "free";

/** The persisted index document for one property. */
export interface PropertyIndex {
  propertyId: string;
  images: ImageEntry[];
  updatedAt: string;
}
