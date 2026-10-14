import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { alignCatalogStart } from "../lib/catalog-scroll";

function browser(t: TestContext) {
  let serial = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const state = { start: 720, busy: false, connected: true };
  const scrolls: number[] = [];
  const view = Object.assign(new EventTarget(), {
    scrollX: 0, scrollY: 2100,
    scrollTo(options: ScrollToOptions) { this.scrollY = options.top!; scrolls.push(this.scrollY); },
  });
  class Observer {
    static instances: Observer[] = [];
    active = false;
    constructor(readonly callback: () => void) { Observer.instances.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
    notify() { if (this.active) this.callback(); }
  }
  const globals = {
    window: view, MutationObserver: Observer, ResizeObserver: Observer,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
  const root = {
    get isConnected() { return state.connected; },
    querySelector(selector: string) {
      if (selector === "[data-catalog-start]") return { getBoundingClientRect: () => ({ top: state.start - view.scrollY }) };
      if (selector === '[aria-busy="true"]') return state.busy ? {} : null;
      // A pinned heading sits at 0 even while the list's start is far above the viewport.
      return { getBoundingClientRect: () => ({ top: 0 }) };
    },
  } as unknown as HTMLElement;
  const tick = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); };
  const notify = () => Observer.instances.forEach(observer => observer.notify());
  const stopped = () => frames.size === 0 && Observer.instances.every(observer => !observer.active);
  return { root, state, view, scrolls, tick, notify, stopped };
}

test("platform selection aligns the actual list start, not a pinned heading, then releases the viewport", t => {
  const ui = browser(t);
  alignCatalogStart(ui.root);
  ui.tick(); ui.tick(); ui.tick();
  assert.deepEqual(ui.scrolls, [720]);
  assert.ok(ui.stopped());
  ui.view.scrollY = 1400; ui.state.start = 760; ui.notify(); ui.tick();
  assert.equal(ui.view.scrollY, 1400, "later carousel or card updates cannot pull the user back");
});

test("a slow source load keeps its title aligned through hero layout changes until content settles", t => {
  const ui = browser(t); ui.state.busy = true;
  alignCatalogStart(ui.root);
  ui.tick(); assert.equal(ui.view.scrollY, 720); assert.equal(ui.stopped(), false);
  ui.state.start = 980; ui.notify(); ui.tick();
  assert.equal(ui.view.scrollY, 980);
  ui.state.busy = false; ui.notify(); ui.tick();
  ui.state.start = 840; ui.notify(); ui.tick(); ui.tick(); ui.tick();
  assert.equal(ui.view.scrollY, 840); assert.ok(ui.stopped());
});

for (const event of ["wheel", "touchmove", "pointerdown", "popstate", "frame:scroll-to-top", "keydown"]) {
  test(`${event} cancels pending source alignment so late data cannot override user navigation`, t => {
    const ui = browser(t); ui.state.busy = true;
    alignCatalogStart(ui.root); ui.tick();
    ui.view.dispatchEvent(Object.assign(new Event(event), event === "keydown" ? { key: "PageDown" } : {}));
    ui.view.scrollY = 1500; ui.state.start = 1000; ui.state.busy = false; ui.notify(); ui.tick();
    assert.equal(ui.view.scrollY, 1500); assert.ok(ui.stopped());
  });
}

test("route cleanup cancels alignment before a filter change or unmount", t => {
  const ui = browser(t); ui.state.busy = true;
  const stop = alignCatalogStart(ui.root); stop(); ui.tick();
  assert.deepEqual(ui.scrolls, []); assert.ok(ui.stopped());
});
