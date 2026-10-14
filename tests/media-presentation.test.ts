import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_MEDIA } from "../lib/demo";
import { cardNumber, featuredIndicatorPositions, formatMediaDate, mergeMediaPages, selectFeaturedMedia } from "../lib/media-presentation";
import { mediaKey } from "../lib/types";

test("featured media selects ten distinct works in current catalog order", () => {
  const works = Array.from({ length: 12 }, (_, i) => ({ ...DEMO_MEDIA[0], id: i + 1 }));
  const input = [works[0], works[0], ...works.slice(1)];
  const selected = selectFeaturedMedia(input);
  assert.equal(selected.length, 10);
  assert.deepEqual(selected.map(mediaKey), works.slice(0, 10).map(mediaKey));
});

test("carousel keeps movie and TV identities distinct and never pads a short result", () => {
  const movie = DEMO_MEDIA[0];
  const tv = { ...movie, mediaType: "tv" as const };
  assert.equal(selectFeaturedMedia([movie, tv, movie]).length, 2);
  assert.deepEqual(selectFeaturedMedia([]), []);
});

test("dates keep month and day without timezone conversion or fabricated precision", () => {
  assert.equal(formatMediaDate("2014-11-04"), "2014-11-04");
  assert.equal(formatMediaDate("2024-02-29"), "2024-02-29");
  for (const value of ["", "2014", "2014-11", "2023-02-29", "2026-13-01"]) {
    assert.equal(formatMediaDate(value), "日期待定");
  }
});

test("official ranks are preserved while discover numbering is explicitly a result index", () => {
  const item = { ...DEMO_MEDIA[0], source: "tmdb" as const, rank: 42 };
  assert.deepEqual(cardNumber(item, true, 1), { kind: "rank", value: 42, text: "#42", label: "官方榜单第 42 名" });
  assert.equal(cardNumber(item, false, 21)?.text, "#21");
  assert.equal(cardNumber(item, false, 21)?.kind, "result");
});

test("preview works do not gain official ranks; invalid numbers are omitted", () => {
  assert.equal(cardNumber({ ...DEMO_MEDIA[0], rank: 1 }, true), null);
  assert.equal(cardNumber(DEMO_MEDIA[0], false, 1)?.kind, "result");
  assert.equal(cardNumber(DEMO_MEDIA[0], false, 0), null);
});


test("all card numbers share visible text while their labels preserve meaning", () => {
  const item = { ...DEMO_MEDIA[0], source: "tmdb" as const, rank: 1 };
  assert.equal(cardNumber(item, true)?.text, cardNumber(item, false, 1)?.text);
  assert.notEqual(cardNumber(item, true)?.label, cardNumber(item, false, 1)?.label);
});

test("recommendation pages append in order and deduplicate across and within pages", () => {
  const [first, second] = DEMO_MEDIA;
  const television = { ...first, mediaType: "tv" as const };
  assert.deepEqual(mergeMediaPages([first], [first, second, second, television]).map(mediaKey), [mediaKey(first), mediaKey(second), mediaKey(television)]);
  assert.deepEqual(mergeMediaPages([first], []), [first]);
});


test("indicators keep fixed groups of five and change pages only across the 5/6 boundary", () => {
  for (let active = 0; active < 10; active++) {
    const visible = featuredIndicatorPositions(10, active);
    assert.equal(visible.length, 5);
    assert.ok(visible.includes(active));
    assert.deepEqual(visible, active < 5 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]);
    assert.ok(visible.every((position, i) => position >= 0 && position < 10 && (!i || position === visible[i - 1] + 1)));
  }
  assert.deepEqual(featuredIndicatorPositions(10, 0), [0, 1, 2, 3, 4]);
  assert.deepEqual(featuredIndicatorPositions(10, 4), [0, 1, 2, 3, 4]);
  assert.deepEqual(featuredIndicatorPositions(10, 5), [5, 6, 7, 8, 9]);
  assert.deepEqual(featuredIndicatorPositions(10, 9), [5, 6, 7, 8, 9]);
});

test("indicator pages never invent slides for short, partial or empty catalogs", () => {
  assert.deepEqual(featuredIndicatorPositions(0, 0), []);
  assert.deepEqual(featuredIndicatorPositions(1, 0), [0]);
  assert.deepEqual(featuredIndicatorPositions(3, 2), [0, 1, 2]);
  assert.deepEqual(featuredIndicatorPositions(5, 4), [0, 1, 2, 3, 4]);
  assert.deepEqual(featuredIndicatorPositions(8, 6), [5, 6, 7]);
});
