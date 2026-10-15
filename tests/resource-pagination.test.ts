import assert from "node:assert/strict";
import test from "node:test";
import { resourcePageForSize, resourcePageSize, resourcePagination } from "../lib/resource-pagination";
import { normalizeResourceChannels } from "../lib/resource-preferences";
import { RESOURCE_CHANNELS } from "../lib/pansou/channels";

test("desktop and mobile paginate five rows with ten and five resources respectively", () => {
  assert.equal(resourcePageSize(false), 10);
  assert.equal(resourcePageSize(true), 5);
  const desktop = resourcePagination(23, 3, resourcePageSize(false));
  assert.deepEqual([desktop.page, desktop.totalPages, desktop.start, desktop.end], [3, 3, 20, 23]);
  const mobile = resourcePagination(23, 5, resourcePageSize(true));
  assert.deepEqual([mobile.page, mobile.totalPages, mobile.start, mobile.end], [5, 5, 20, 23]);
});

test("walking every page visits each resource once without duplicates or omissions", () => {
  for (const total of [0, 1, 5, 10, 11, 23, 100, 101]) for (const mobile of [false, true]) {
    const source = Array.from({ length: total }, (_, index) => `resource-${index}`);
    const before = [...source], size = resourcePageSize(mobile), visited: string[] = [];
    const { totalPages } = resourcePagination(total, 1, size);
    for (let page = 1; page <= totalPages; page++) {
      const current = resourcePagination(total, page, size);
      const items = source.slice(current.start, current.end);
      assert.ok(items.length <= size);
      if (page < totalPages) assert.equal(items.length, size);
      visited.push(...items);
    }
    assert.deepEqual(visited, source);
    assert.equal(new Set(visited).size, total);
    assert.deepEqual(source, before);
  }
});

test("restored page numbers are clamped when results shrink and empty lists remain on page one", () => {
  for (const requested of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(resourcePagination(23, requested, 10).page, 1);
  }
  assert.equal(resourcePagination(23, 999, 10).page, 3);
  assert.equal(resourcePagination(23, 2.9, 10).page, 2);
  const shrunken = resourcePagination(7, 19, 5);
  assert.deepEqual([shrunken.page, shrunken.start, shrunken.end], [2, 5, 7]);
  for (const count of [0, -10, Number.NaN]) {
    const empty = resourcePagination(count, 19, 5);
    assert.deepEqual([empty.page, empty.totalPages, empty.start, empty.end, empty.pages], [1, 1, 0, 0, [1]]);
  }
});

test("page controls show a bounded ordered window containing the selected page including both ends", () => {
  for (const size of [5, 10]) for (const total of [5, 23, 101]) {
    const { totalPages } = resourcePagination(total, 1, size);
    for (let page = 1; page <= totalPages; page++) {
      const current = resourcePagination(total, page, size);
      assert.ok(current.pages.includes(page));
      assert.equal(current.pages.length, Math.min(5, totalPages));
      assert.equal(new Set(current.pages).size, current.pages.length);
      assert.ok(current.pages.every(value => value >= 1 && value <= totalPages));
      assert.deepEqual([...current.pages].sort((a, b) => a - b), current.pages);
      if (page === 1) assert.equal(current.pages[0], 1);
      if (page === totalPages) assert.equal(current.pages.at(-1), totalPages);
    }
  }
});

test("responsive resizing retains the old first resource inside the new page and does not leave bounds", () => {
  for (const total of [1, 7, 23, 101]) for (const [fromSize, toSize] of [[10, 5], [5, 10]]) {
    const { totalPages } = resourcePagination(total, 1, fromSize);
    for (let page = 1; page <= totalPages; page++) {
      const old = resourcePagination(total, page, fromSize);
      const next = resourcePagination(total, resourcePageForSize(old.page, fromSize, toSize), toSize);
      assert.ok(next.page >= 1 && next.page <= next.totalPages);
      assert.ok(next.start <= old.start && next.end > old.start);
    }
  }
  assert.equal(resourcePageForSize(3, 10, 5), 5);
  assert.equal(resourcePageForSize(4, 5, 10), 2);
});

test("filtering the snapshot preserves source order and yields complete distinct pages", () => {
  const source = Array.from({ length: 41 }, (_, index) => ({ id: index, channel: index % 3 === 0 ? "guangya" : "115" }));
  const filtered = source.filter(item => item.channel === "guangya");
  for (const size of [5, 10]) {
    const visited: number[] = [];
    const { totalPages } = resourcePagination(filtered.length, 1, size);
    for (let page = 1; page <= totalPages; page++) {
      const current = resourcePagination(filtered.length, page, size);
      visited.push(...filtered.slice(current.start, current.end).map(item => item.id));
    }
    assert.deepEqual(visited, filtered.map(item => item.id));
    assert.equal(new Set(visited).size, filtered.length);
  }
});

test("stored channel subsets discard retired others without silently replacing it with Guangya", () => {
  assert.deepEqual(normalizeResourceChannels(["others", "115", "quark", "115"]), ["115", "quark"]);
  assert.deepEqual(normalizeResourceChannels(["guangya", "quark"]), ["quark", "guangya"]);
  assert.deepEqual(normalizeResourceChannels(["115", "bad-channel", 115]), ["115"]);
});

test("a legacy select-all preference migrates to the new full list and corrupt preferences use the same default", () => {
  const all = RESOURCE_CHANNELS.map(channel => channel.id);
  const legacy = ["baidu", "aliyun", "quark", "tianyi", "uc", "mobile", "115", "pikpak", "xunlei", "123", "magnet", "ed2k", "others"];
  assert.deepEqual(normalizeResourceChannels(legacy), all);
  for (const saved of [null, {}, "115", [], ["not-a-channel"]]) {
    assert.deepEqual(normalizeResourceChannels(saved), all);
  }
});
