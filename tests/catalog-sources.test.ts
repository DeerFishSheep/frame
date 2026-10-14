import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG_SOURCES, catalogSource, catalogSourceHref, formatCatalogTitle } from "../lib/catalog-sources";
import { formatFeaturedLabel } from "../lib/media-presentation";
import { CatalogSection } from "../components/catalog-section";

test("switching sources restores that media type's own chart and sorting", () => {
  const current = new URLSearchParams("source=imdb&media=tv&chart=popular&sort=popularity");
  const remembered = "/?media=tv&chart=trending&period=week";
  let asked = "";
  assert.equal(catalogSourceHref("tmdb", current, key => { asked = key; return remembered; }), remembered);
  assert.equal(asked, "catalog-location:tv:tmdb");
  current.set("media", "movie");
  catalogSourceHref("tmdb", current, key => { asked = key; return undefined; });
  assert.equal(asked, "catalog-location:movie:tmdb");
});

test("reselecting the current source never resets its page, filters or sorting", () => {
  const params = new URLSearchParams("source=imdb&media=movie&chart=popular&sort=num_votes&page=3");
  assert.equal(catalogSourceHref("imdb", params, () => { throw new Error("Must not replace current conditions"); }), `/?${params}`);
  assert.equal(catalogSource(new URLSearchParams("source=unknown")), "tmdb");
});

test("first switches preserve movie/TV and map only supported chart defaults", () => {
  const imdb = new URL(catalogSourceHref("imdb", new URLSearchParams("media=tv&chart=now&period=week&sort=vote_count.desc"), () => undefined), "https://frame.test");
  assert.equal(imdb.searchParams.get("media"), "tv");
  assert.equal(imdb.searchParams.get("chart"), "top");
  assert.equal(imdb.searchParams.get("sort"), "rank");
  assert.equal(imdb.searchParams.has("period"), false);
  const tmdb = new URL(catalogSourceHref("tmdb", new URLSearchParams("source=imdb&media=movie&chart=popular&sort=num_votes"), () => undefined), "https://frame.test");
  assert.equal(tmdb.searchParams.get("chart"), "popular");
  assert.equal(tmdb.searchParams.get("media"), "movie");
  assert.equal(tmdb.searchParams.has("sort"), false);
});

test("shared headings and hero labels apply exactly one platform prefix and preserve preview identity", () => {
  assert.equal(formatCatalogTitle("tmdb", "本周趋势"), "TMDB · 本周趋势");
  assert.equal(formatCatalogTitle("imdb", "IMDB·热门电视剧"), "IMDB · 热门电视剧");
  assert.equal(formatCatalogTitle("demo", "今日趋势"), "预览 · 今日趋势");
  assert.equal(formatFeaturedLabel("imdb", "热门电影"), formatCatalogTitle("imdb", "热门电影"));
  const html = renderToStaticMarkup(createElement(CatalogSection, { id: "test-chart", title: "本周趋势", dataSource: "tmdb", children: null }));
  assert.ok(html.includes('<h2 id="test-chart">TMDB · 本周趋势</h2>'));
});

test("every selectable platform has a bundled image so icons require no external request", () => {
  for (const source of CATALOG_SOURCES) {
    assert.ok(source.icon.startsWith("/platforms/"));
    const bytes = readFileSync(`public${source.icon}`);
    assert.ok(bytes.length > 100);
    assert.ok(source.icon.endsWith(".svg") && /<svg[^>]+viewBox=/.test(bytes.toString()) || bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) || bytes.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])));
  }
});
