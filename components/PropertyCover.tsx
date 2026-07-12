"use client";

import { useState } from "react";
import { RENTAL_MODEL_LABEL, type Property } from "@/lib/data";

/** Calm duotone gradients for properties without a photo — picked
 *  deterministically from the id so each property keeps its colour. */
const COVER_FALLBACKS = [
  ["#41506b", "#6b7f9e"], // slate blue
  ["#2f6fed", "#7ea6f4"], // accent blue
  ["#2e7d64", "#6fae97"], // pine green
  ["#8a6a45", "#bfa07a"], // warm sand
];

function coverFallback(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [a, b] = COVER_FALLBACKS[h % COVER_FALLBACKS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Letterboxed cover strip — short on purpose so the photo identifies the
 *  property without dominating the card. Falls back to a monogram gradient
 *  when there is no photo (or it fails to load), and carries the rental-model
 *  chip so the card body stays clean. */
export function PropertyCover({ property }: { property: Property }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!property.imageUrl && !broken;

  return (
    <div className="relative aspect-[5/2] overflow-hidden shrink-0">
      {showPhoto ? (
        // Plain <img>: cover URLs are user-supplied, so skip next/image domain config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={property.imageUrl}
          alt={`${property.name} cover photo`}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: coverFallback(property.id) }}
          aria-hidden
        >
          <span
            className="text-2xl font-semibold tracking-[0.18em]"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {initials(property.shortName || property.name)}
          </span>
        </div>
      )}

      {/* Soft bottom scrim keeps the chip legible on any photo */}
      <div
        className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(15,17,22,0.45), transparent)" }}
        aria-hidden
      />
      <span
        className="absolute left-3 bottom-2.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm"
        style={{ background: "rgba(15,17,22,0.45)", color: "rgba(255,255,255,0.92)" }}
      >
        {RENTAL_MODEL_LABEL[property.rentalModel]}
      </span>
    </div>
  );
}
