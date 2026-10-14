import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaCard } from "../components/media-card";
import { FrameProvider } from "../components/providers";
import { formatRegions, normalizeCountryCodes } from "../lib/media-regions";
import { mediaCountryCodes, normalizeDetail, normalizeMedia } from "../lib/tmdb/normalize";
import { createTmdbClient } from "../lib/tmdb/client";
import { createTmdbService } from "../lib/tmdb/service";
import { DEFAULT_FILTERS } from "../lib/types";
import { parseFavorites } from "../lib/favorites";

test("region labels normalize, deduplicate and translate codes without guessing unknown values", () => {
  assert.deepEqual(normalizeCountryCodes(["kr", " US ", "KR", "ZZ", "XX", 3, null]), ["KR", "US"]);
  assert.equal(formatRegions(["CN", "HK", "TW", "US", "GB", "KR"]), "中国大陆 / 中国香港 / 中国台湾 / 美国 / 英国 / 韩国");
  assert.equal(formatRegions(undefined), "");
});

test("origin metadata and production fallback agree across list and detail, never using language", () => {
  const raw = { id: 12, name: "作品", origin_country: ["KR"], production_countries: [{ iso_3166_1: "US", name: "United States" }] };
  assert.deepEqual(normalizeMedia(raw, "tv").countryCodes, ["KR"]);
  assert.deepEqual(normalizeDetail(raw, "tv").countryCodes, ["KR"]);
  assert.deepEqual(normalizeDetail(raw, "tv").countries, ["美国"]);
  assert.deepEqual(mediaCountryCodes({ production_countries: raw.production_countries }), ["US"]);
  assert.equal(normalizeMedia({ id: 1, original_language: "ko" }, "movie").countryCodes, undefined);
  assert.deepEqual(normalizeMedia({ id: 1, origin_country: [] }, "tv").countryCodes, []);
});

test("new favorites persist region codes while old saved entries remain valid", () => {
  const item = normalizeMedia({ id: 1, title: "作品", origin_country: ["KR"] }, "movie");
  assert.deepEqual(parseFavorites(JSON.stringify([item]))[0].countryCodes, ["KR"]);
  const { countryCodes: _, ...old } = item;
  assert.equal(parseFavorites(JSON.stringify([old]))[0].title, "作品");
  assert.equal(parseFavorites(JSON.stringify([{ ...item, countryCodes: [23] }])).length, 0);
});

test("shared cards show region before media kind and omit the separator when region is missing", () => {
  const item = normalizeMedia({ id: 1, name: "作品", origin_country: ["KR"] }, "tv");
  const render = (countryCodes: string[]) => renderToStaticMarkup(createElement(FrameProvider, {
    configured: true, children: createElement(MediaCard, { item: { ...item, countryCodes } }),
  }));
  assert.match(render(["KR"]), /poster-region">韩国<\/span><span aria-hidden="true">·<\/span><span class="poster-media-kind">剧集/);
  assert.ok(!render([]).includes('class="poster-region"'));
});

test("region lookup validates IDs, reuses cache and leaves the catalog independent", async () => {
  let calls = 0;
  const client = createTmdbClient({ token: "test", fetchImpl: async input => {
    calls++;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/movie/1")) return Response.json({ id: 1, production_countries: [{ iso_3166_1: "KR" }] });
    if (url.pathname.endsWith("/trending/movie/day")) return Response.json({ page: 1, results: [{ id: 2, title: "作品" }], total_pages: 1 });
    throw new Error("Unexpected endpoint");
  } });
  const service = createTmdbService(client);
  await assert.rejects(service.regions("person", "1"));
  await assert.rejects(service.regions("movie", "1/credits"));
  assert.equal(calls, 0);
  const [a, b] = await Promise.all([service.regions("movie", "1"), service.regions("movie", "1")]);
  assert.deepEqual(a.countryCodes, ["KR"]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  const page = await service.catalog(DEFAULT_FILTERS);
  assert.equal(page.results[0].countryCodes, undefined);
  assert.equal(calls, 2); // The catalog did not wait for or issue movie-detail requests.
});

test("metadata requests have a global four-request limit and recover slots after failure", async () => {
  let active = 0, peak = 0;
  const client = createTmdbClient({ token: "test", fetchImpl: async input => {
    const id = Number(new URL(String(input)).pathname.split("/").pop());
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return id === 1 ? Response.json({}, { status: 404 }) : Response.json({ id, origin_country: ["JP"] });
  } });
  const service = createTmdbService(client);
  const results = await Promise.allSettled(Array.from({ length: 9 }, (_, i) => service.regions("movie", String(i + 1))));
  assert.equal(peak, 4);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 8);
  assert.equal(active, 0);
});
