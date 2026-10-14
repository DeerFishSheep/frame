/** A one-shot scroll intent for explicit platform switches, never for history or filter updates. */
export function alignCatalogStart(root: HTMLElement) {
  let frame = 0, stopped = false, settled = 0, previousTop: number | null = null;
  const mutation = new MutationObserver(schedule);
  const resize = new ResizeObserver(schedule);
  function schedule() {
    if (stopped) return;
    cancelAnimationFrame(frame); frame = requestAnimationFrame(align);
  }
  function finish() {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame); mutation.disconnect(); resize.disconnect();
    window.removeEventListener("wheel", finish); window.removeEventListener("touchmove", finish);
    window.removeEventListener("pointerdown", finish); window.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", finish); window.removeEventListener("frame:scroll-to-top", finish);
  }
  function onKey(event: KeyboardEvent) {
    if (!event.defaultPrevented && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) finish();
  }
  function align() {
    if (stopped) return;
    if (!root.isConnected) { finish(); return; }
    // The heading is sticky: its viewport position cannot locate the start of the list.
    const start = root.querySelector<HTMLElement>("[data-catalog-start]");
    if (!start) return;
    const top = Math.max(0, window.scrollY + start.getBoundingClientRect().top);
    if (Math.abs(window.scrollY - top) > .5) window.scrollTo({ top, left: window.scrollX, behavior: "instant" });
    if (root.querySelector('[aria-busy="true"]')) { settled = 0; previousTop = null; return; }
    // Keep the title aligned while the new hero/content settles, then release the viewport.
    settled = previousTop !== null && Math.abs(top - previousTop) < .5 ? settled + 1 : 1;
    previousTop = top;
    if (settled >= 3) finish(); else schedule();
  }
  mutation.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
  resize.observe(root);
  window.addEventListener("wheel", finish, { passive: true }); window.addEventListener("touchmove", finish, { passive: true });
  window.addEventListener("pointerdown", finish); window.addEventListener("keydown", onKey);
  window.addEventListener("popstate", finish); window.addEventListener("frame:scroll-to-top", finish);
  schedule();
  return finish;
}
