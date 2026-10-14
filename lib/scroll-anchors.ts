/** A pinned heading cannot encode how far the user has read into its list. */
export function isPinnedAnchor(element: HTMLElement): boolean {
  const heading = element.closest<HTMLElement>("[data-sticky-heading]");
  return Boolean(heading && heading.getBoundingClientRect().top <= 1);
}
