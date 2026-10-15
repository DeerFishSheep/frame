import assert from "node:assert/strict";
import test from "node:test";
import { createTmdbSeasonDetailService } from "../lib/tmdb/season-detail";
import { TmdbError } from "../lib/tmdb/client";

const stamp = "2026-10-15T00:00:00.000Z";
function fixture() {
  return {
    id: 298931, name: "杀死你的旅途", original_name: "あなたを殺す旅", first_air_date: "2025-09-26", overview: "整剧简介不可串入第二季",
    poster_path: "/series.jpg", backdrop_path: "/series-backdrop.jpg", vote_average: 9.8, vote_count: 9000, popularity: 100,
    number_of_seasons: 2, episode_run_time: [55], status: "Returning Series", created_by: [{ name: "整剧主创" }],
    origin_country: ["JP"], genres: [{ id: 18, name: "剧情" }],
    seasons: [{ id: 471139, season_number: 1, air_date: "2025-09-26", episode_count: 6 }, { id: 533045, season_number: 2, air_date: "2026-10-08", episode_count: 6 }],
    credits: { cast: [{ id: 1, name: "整剧演员", profile_path: "/wrong.jpg" }] }, images: { backdrops: [{ file_path: "/wrong-backdrop.jpg" }] },
    external_ids: { imdb_id: "tt38493347" }, recommendations: { page: 1, total_pages: 1, total_results: 1, results: [{ id: 88, name: "相关剧", first_air_date: "2020-01-01" }] },
    "season/2": { _id: "real-append-can-omit-numeric-id", season_number: 2, air_date: "2026-10-08", poster_path: "/season-two.jpg", overview: "第二季专属简介", vote_average: 8.1, vote_count: 12,
      episodes: [{ id: 77, show_id: 298931, season_number: 2, runtime: 24, still_path: "/episode-one.jpg", vote_count: 1000 }, { id: 78, show_id: 298931, season_number: 2, runtime: 24, still_path: "/episode-two.jpg", vote_count: 2000 }] },
    "season/2/credits": { cast: [{ id: 2, name: "本季演员", character: "角色", profile_path: "/cast.jpg" }], crew: [{ id: 3, name: "本季导演", job: "Director" }] },
    "season/2/images": { backdrops: [{ file_path: "/season-backdrop.jpg" }], stills: [{ file_path: "/episode-one.jpg" }], posters: [{ file_path: "/not-a-still.jpg" }] },
  };
}
function setup(raw: unknown) {
  const calls: { path: string; params: URLSearchParams }[] = [];
  const service = createTmdbSeasonDetailService({ request: async <T>(path: string, params = new URLSearchParams()) => {
    calls.push({ path, params }); return { data: raw as T, retrievedAt: stamp, stale: true };
  } });
  return { service, calls };
}
const errorCode = (code: string, status: number) => (error: unknown) => error instanceof TmdbError && error.code === code && error.status === status;

test("season detail keeps series identity and shared metadata but replaces every season-specific field", async () => {
  const { service, calls } = setup(fixture());
  const { detail, retrievedAt, stale } = await service("298931", 2);
  assert.equal(calls.length, 1); assert.equal(calls[0].path, "/tv/298931");
  assert.equal(calls[0].params.get("append_to_response"), "season/2,season/2/credits,season/2/images,external_ids,recommendations");
  assert.equal(detail.id, 298931); assert.equal(detail.seasonNumber, 2);
  assert.equal(detail.title, "杀死你的旅途 第2季"); assert.equal(detail.originalTitle, "あなたを殺す旅 Season 2");
  assert.equal(detail.releaseDate, "2026-10-08"); assert.equal(detail.year, "2026"); assert.equal(detail.posterPath, "/season-two.jpg");
  assert.equal(detail.overview, "第二季专属简介"); assert.equal(detail.backdropPath, "/season-backdrop.jpg");
  assert.deepEqual(detail.images, ["/season-backdrop.jpg", "/episode-one.jpg", "/episode-two.jpg"]);
  assert.deepEqual(detail.cast.map(person => person.name), ["本季演员"]); assert.deepEqual(detail.directors, ["本季导演"]);
  assert.equal(detail.numberOfEpisodes, 6); assert.equal(detail.numberOfSeasons, null); assert.equal(detail.status, ""); assert.equal(detail.runtime, 24);
  assert.equal(detail.voteAverage, 8.1); assert.equal(detail.voteCount, 12); assert.equal(detail.popularity, 0);
  assert.equal(detail.imdbId, "tt38493347"); assert.deepEqual(detail.countryCodes, ["JP"]); assert.equal(detail.recommendations.results[0].id, 88);
  assert.equal(retrievedAt, stamp); assert.equal(stale, true);
});

test("missing seasonal content stays missing without inheriting series poster, credits, images or ratings", async () => {
  const raw = fixture();
  Object.assign(raw["season/2"], { poster_path: null, overview: "", vote_average: undefined, vote_count: undefined,
    episodes: [{ id: 77, show_id: 298931, season_number: 2, runtime: null, vote_average: 9.7, vote_count: 9000 }] });
  Object.assign(raw, { "season/2/credits": {}, "season/2/images": {} });
  const { detail } = await setup(raw).service("298931", 2);
  assert.equal(detail.posterPath, null); assert.equal(detail.posterFallbacks, undefined); assert.equal(detail.backdropPath, null); assert.equal(detail.overview, "");
  assert.deepEqual(detail.cast, []); assert.deepEqual(detail.directors, []); assert.deepEqual(detail.images, []);
  assert.equal(detail.voteAverage, 0); assert.equal(detail.voteCount, 0); assert.equal(detail.runtime, null);
});

test("unknown season dates and counts never reuse the series premiere or total season count", async () => {
  const raw = fixture();
  Object.assign(raw.seasons[1], { air_date: null, episode_count: undefined });
  Object.assign(raw["season/2"], { air_date: null });
  const { detail } = await setup(raw).service("298931", 2);
  assert.equal(detail.releaseDate, ""); assert.equal(detail.year, ""); assert.equal(detail.numberOfEpisodes, 2);
  Object.assign(raw["season/2"], { episodes: undefined });
  assert.equal((await setup(raw).service("298931", 2)).detail.numberOfEpisodes, null);
});

test("varying episode runtimes do not invent a seasonal average and missing fields can use only the same season summary", async () => {
  const raw = fixture(); raw["season/2"].episodes[1].runtime = 51;
  Object.assign(raw["season/2"], { air_date: null });
  const { detail } = await setup(raw).service("298931", 2);
  assert.equal(detail.runtime, null); assert.equal(detail.releaseDate, "2026-10-08");
});

test("invalid identifiers are rejected before transport and an absent season is a true not-found", async () => {
  const { service, calls } = setup(fixture());
  for (const [id, season] of [["0", 2], ["1/season/2", 2], ["1", 0], ["1", 100], ["1", 1.5], ["9007199254740992", 2]] as const) await assert.rejects(service(id, season), errorCode("INVALID_MEDIA_ID", 400));
  assert.equal(calls.length, 0);
  await assert.rejects(service("298931", 3), errorCode("TMDB_NOT_FOUND", 404));
});

test("mismatched series, season, date, optional numeric IDs and episode ownership all fail closed", async () => {
  const mutations: ((raw: ReturnType<typeof fixture>) => void)[] = [
    raw => { raw.id = 10; }, raw => { raw.seasons.push(raw.seasons[1]); },
    raw => { raw["season/2"].season_number = 1; }, raw => { raw["season/2"].air_date = "2025-09-26"; },
    raw => { raw["season/2"].air_date = "2026-02-30"; }, raw => { Object.assign(raw["season/2"], { id: 471139 }); },
    raw => { Object.assign(raw["season/2/credits"], { id: 471139 }); }, raw => { Object.assign(raw["season/2/images"], { id: 471139 }); },
    raw => { raw["season/2"].episodes[0].show_id = 99; }, raw => { raw["season/2"].episodes[0].season_number = 1; },
    raw => { Object.assign(raw["season/2"], { episodes: {} }); }, raw => { raw.seasons[1].id = 0; },
  ];
  for (const mutate of mutations) { const raw = fixture(); mutate(raw); await assert.rejects(setup(raw).service("298931", 2), errorCode("TMDB_INVALID_RESPONSE", 502)); }
});

test("unsafe seasonal artwork and duplicate cast/stills cannot leak through normalized detail", async () => {
  const raw = fixture(); raw["season/2"].poster_path = "https://untrusted.example/poster.jpg";
  raw["season/2"].episodes[0].still_path = "javascript:alert(1)";
  raw["season/2/credits"].cast.push({ ...raw["season/2/credits"].cast[0], character: "另一个角色" });
  raw["season/2/images"].backdrops.push({ file_path: "//untrusted.example/image.jpg" });
  const { detail } = await setup(raw).service("298931", 2);
  assert.equal(detail.posterPath, null); assert.equal(detail.cast.length, 1);
  assert.equal(detail.images.some(path => path.includes(":")), false);
  assert.equal(detail.images.some(path => path.startsWith("//")), false);
});
