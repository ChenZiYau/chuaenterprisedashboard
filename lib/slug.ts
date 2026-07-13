/** Validation for custom share-link slugs (the path segment after /p/). */

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase + trim user input into canonical slug form. */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

/** Returns an error message for an invalid slug, or null when valid. */
export function slugError(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `Use at most ${SLUG_MAX} characters.`;
  if (!SLUG_RE.test(slug))
    return "Only lowercase letters, numbers and single hyphens (not at the ends).";
  return null;
}
