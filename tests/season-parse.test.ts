import assert from "node:assert/strict";
import test from "node:test";
import { searchTitle, tvSeasonNumber } from "../lib/media-match";
import { createTmdbClient } from "../lib/tmdb/client";
import { createTmdbService } from "../lib/tmdb/service";

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const service = (fetchImpl: typeof fetch) => createTmdbService(createTmdbClient({ token: "synthetic-token", fetchImpl }));

test("Korean 시즌N and guarded bare trailing numbers are seasons, while ordinary numbers stay whole", () => {
  for (const [title, number] of [
    ["유미의세포들 시즌3", 3],
    ["유미의 세포들 시즌 3", 3],
    ["问心2", 2],
    ["飞常日志2", 2],
    ["IT狗2.0", 2],
    ["示例 第２季", 2],
    ["示例 第二十季", 20],
  ] as const) {
    assert.equal(tvSeasonNumber(title), number, title);
  }
  for (const title of [
    "1923", "24小时", "Class2", "CANON 2", "Se7en", "Number 1 Ladies' Detective Agency",
    "Seasons", "示例 第零季", "示例 第一百季", "问心", "IT狗", "問心",
  ]) {
    assert.equal(tvSeasonNumber(title), null, title);
  }
  assert.equal(tvSeasonNumber("TXQ FICTION 神木隆之介"), null, "a middle number is not a season suffix");
  assert.equal(tvSeasonNumber("只是朋友2：梦想天开"), null, "a middle number is not a season suffix");
  for (const title of ["边界旅途 第零季", "边界旅途 第一百季", "Boundary Journey Season 0", "Boundary Journey S100"]) {
    assert.equal(tvSeasonNumber(title), null, title);
  }
});

test("an unparsable season marker is stripped so callers can refuse it instead of searching the whole name", () => {
  for (const [title, stripped] of [
    ["边界旅途 第零季", "边界旅途"],
    ["边界旅途 第一百季", "边界旅途"],
    ["Boundary Journey Season 0", "Boundary Journey"],
    ["Boundary Journey S100", "Boundary Journey"],
  ] as const) {
    assert.equal(searchTitle(title, "tv"), stripped, title);
  }
  assert.equal(tvSeasonNumber("边界旅途"), null, "the stripped name alone is not a season");
});

test("searchTitle strips exactly the season markers that tvSeasonNumber reads", () => {
  assert.equal(searchTitle("유미의세포들 시즌3", "tv"), "유미의세포들");
  assert.equal(searchTitle("유미의 세포들 시즌 3", "tv"), "유미의 세포들");
  assert.equal(searchTitle("问心2", "tv"), "问心");
  assert.equal(searchTitle("飞常日志2", "tv"), "飞常日志");
  assert.equal(searchTitle("IT狗2.0", "tv"), "IT狗");
  assert.equal(searchTitle("示例 第二季", "tv"), "示例");
  assert.equal(searchTitle("示例 第２季", "tv"), "示例");
  assert.equal(searchTitle("Public Show Season 2", "tv"), "Public Show");
  assert.equal(searchTitle("CANON 2", "tv"), "CANON 2", "a Latin-only bare number is not a season suffix");
  assert.equal(searchTitle("1923", "tv"), "1923");
  assert.equal(searchTitle("24小时", "tv"), "24小时");
  assert.equal(searchTitle("Class2", "tv"), "Class2");
  assert.equal(searchTitle("问心2", "movie"), "问心2", "movie titles never strip season suffixes");
});

test("an empty year-filtered search is retried once without the year, and a non-empty one is not", async () => {
  const requests: URL[] = [];
  const sequential = service(async input => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.searchParams.has("first_air_date_year")) return json({ results: [] });
    return json({ results: [{ id: 233076, name: "问心", original_name: "问心", first_air_date: "2023-10-07" }] });
  });
  const relaxed = await sequential.searchCandidates("问心2", "2026", "tv");
  assert.deepEqual(relaxed.map(item => [item.id, item.year]), [[233076, "2023"]]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("query"), "问心");
  assert.equal(requests[0].searchParams.get("first_air_date_year"), "2026");
  assert.equal(requests[1].searchParams.has("first_air_date_year"), false);

  const stable: URL[] = [];
  const direct = service(async input => {
    const url = new URL(String(input));
    stable.push(url);
    return json({ results: [{ id: 155330, name: "IT狗", original_name: "IT狗", first_air_date: "2022-01-10" }] });
  });
  assert.equal((await direct.searchCandidates("IT狗2.0", "2026", "tv")).length, 1);
  assert.equal(stable.length, 1, "a year-filtered search that returned results is never retried");
  assert.equal(stable[0].searchParams.get("query"), "IT狗");
  assert.equal(stable[0].searchParams.get("first_air_date_year"), "2026");
});

test("the relaxed candidates still have to survive the existing exact name and year acceptance", async () => {
  const responses = [{ results: [] }, { results: [
    { id: 243236, name: "飞常日志", original_name: "飛常日誌", first_air_date: "2024-01-15" },
    { id: 99, name: "飞常日志2", original_name: "飞常日志2", first_air_date: "2026-06-15" },
  ] }];
  const client = service(async () => json(responses.shift() ?? { results: [] }));
  const candidates = await client.searchCandidates("飞常日志2", "2026", "tv");
  assert.deepEqual(candidates.map(item => item.id), [243236, 99], "provider order is preserved");
  assert.equal(await client.findByTitle("飞常日志2", "2026", "tv"), null, "a year-mismatched parent series is not a same-year match");
});

test("invalid titles and years never reach the relaxed retry", async () => {
  let calls = 0;
  const client = service(async () => { calls++; return json({ results: [] }); });
  assert.deepEqual(await client.searchCandidates("   ", "2026", "tv"), []);
  assert.deepEqual(await client.searchCandidates("问心2", "26", "tv"), []);
  assert.deepEqual(await client.searchCandidates("问".repeat(201), "2026", "tv"), []);
  assert.equal(calls, 0);
});
