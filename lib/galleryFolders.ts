import type { Property, Unit } from "./data";

/** Stable, separate indexes: room renames never move or mix existing photos. */
export function roomGalleryId(propertyId: string, unitId: string) {
  return `room~${encodeURIComponent(propertyId)}~${encodeURIComponent(unitId)}`;
}

export function galleryFolders(property: Property, units: Unit[]): Property[] {
  return [property, ...(property.rentalModel === "room_rental"
    ? units.filter((unit) => unit.propertyId === property.id).map((unit) => ({
        ...property,
        id: roomGalleryId(property.id, unit.id),
        slug: undefined,
        name: `${property.name} — ${unit.name}`,
        shortName: unit.name,
      }))
    : [])];
}

export function galleryLink(property: Pick<Property, "id" | "slug">) {
  const base = (process.env.NEXT_PUBLIC_VAULT_URL || "https://chuaimage.vercel.app").replace(/\/+$/, "");
  return `${base}/p/${encodeURIComponent(property.slug?.trim() || property.id)}`;
}
