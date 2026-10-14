import assert from "node:assert/strict";
import test from "node:test";
import { FAVORITES_KEY, parseFavorites, readFavorites, toggleFavorite, writeFavorites } from "../lib/favorites";
import { mediaKey, type Media } from "../lib/types";

const movie: Media = {
  id: 123, mediaType: "movie", title: "测试电影", originalTitle: "Test Movie",
  posterPath: null, backdropPath: "/backdrop.jpg", overview: "电影简介",
  releaseDate: "2024-01-01", year: "2024", genreIds: [18], genres: ["剧情"],
  voteAverage: 8.2, voteCount: 300, popularity: 42, source: "tmdb",
};
const series: Media = { ...movie, mediaType: "tv", title: "测试剧集" };

test("movie and television with the same numeric id can both be saved", () => {
  const movies = toggleFavorite([], movie);
  const both = toggleFavorite(movies, series);
  assert.deepEqual(both.map(mediaKey), ["movie:123", "tv:123"]);
  assert.deepEqual(toggleFavorite(both, movie).map(mediaKey), ["tv:123"]);
  assert.deepEqual(movies, [movie]);
  assert.deepEqual(both, [movie, series]);
});

test("invalid JSON and invalid top-level values recover as an empty collection", () => {
  for (const raw of [null, "", "{broken", "null", "{}", "123", '"text"']) {
    assert.deepEqual(parseFavorites(raw), []);
  }
});

test("every required field is validated before a favorite reaches the UI", () => {
  const invalidFields: Record<keyof Media, unknown> = {
    id: -1, imdbId: 12, mediaType: "person", title: "", originalTitle: 2,
    posterPath: {}, backdropPath: [], overview: null, releaseDate: 2024,
    year: false, countryCodes: [12], genreIds: ["18"], genres: [{ name: "剧情" }],
    voteAverage: 11, voteCount: 1.5, popularity: -1, source: "imdb", rank: 0,
  };
  for (const [field, invalid] of Object.entries(invalidFields)) {
    assert.deepEqual(parseFavorites(JSON.stringify([{ ...movie, [field]: invalid }])), [], field);
  }
  for (const field of Object.keys(movie)) {
    const partial = { ...movie } as Record<string, unknown>;
    delete partial[field];
    assert.deepEqual(parseFavorites(JSON.stringify([partial])), [], `missing ${field}`);
  }
});

test("one damaged record does not erase valid records and duplicate keys are removed", () => {
  const restored = parseFavorites(JSON.stringify([movie, null, { id: 5 }, movie, series]));
  assert.deepEqual(restored, [movie, series]);
  assert.notEqual(restored[0].genres, movie.genres);
});

test("only known media fields are restored and persisted", () => {
  const extended = { ...movie, unrelatedCredential: "example-only", cast: [{ name: "actor" }] };
  assert.deepEqual(parseFavorites(JSON.stringify([extended])), [movie]);
  let savedKey = "";
  let savedRaw = "";
  writeFavorites({ setItem: (key, value) => { savedKey = key; savedRaw = value; } }, [extended]);
  assert.equal(savedKey, FAVORITES_KEY);
  assert.deepEqual(JSON.parse(savedRaw), [movie]);
});

test("blocked storage reads recover but failed writes reach the caller", () => {
  const denied = new Error("storage denied");
  assert.deepEqual(readFavorites({ getItem: () => { throw denied; } }), []);
  assert.throws(() => writeFavorites({ setItem: () => { throw denied; } }, [movie]), (error) => error === denied);
  assert.deepEqual(readFavorites({ getItem: () => JSON.stringify([movie]) }), [movie]);
});
