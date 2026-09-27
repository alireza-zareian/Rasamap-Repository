/**
 * Names for view transitions that span two pages. Both ends must spell the
 * name the same way, or the browser sees two unrelated elements and the morph
 * silently does not happen — so it is spelled once, here.
 */
export const mediaPhotoTransition = (slug: string) => `media-photo-${slug}`;
