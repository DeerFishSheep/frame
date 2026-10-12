import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_MEDIA } from "../lib/demo";
import { cardNumber, formatMediaDate, selectFeaturedMedia } from "../lib/media-presentation";
import { mediaKey } from "../lib/types";

test("featured media selects five distinct works in current catalog order", () => {
  const input = [DEMO_MEDIA[0], DEMO_MEDIA[0], ...DEMO_MEDIA.slice(1)];
  const selected = selectFeaturedMedia(input);
  assert.equal(selected.length, 5);
  assert.deepEqual(selected.map(mediaKey), DEMO_MEDIA.slice(0, 5).map(mediaKey));
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
  assert.equal(cardNumber(item, false, 21)?.text, "序 21");
  assert.equal(cardNumber(item, false, 21)?.kind, "result");
});

test("preview works do not gain official ranks; invalid numbers are omitted", () => {
  assert.equal(cardNumber({ ...DEMO_MEDIA[0], rank: 1 }, true), null);
  assert.equal(cardNumber(DEMO_MEDIA[0], false, 1)?.kind, "result");
  assert.equal(cardNumber(DEMO_MEDIA[0], false, 0), null);
});
