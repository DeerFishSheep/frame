import assert from "node:assert/strict";
import test from "node:test";
import { mergeCastMembers } from "../lib/media-cast";
import { normalizeDetail } from "../lib/tmdb/normalize";

// Actual duplicate credits from movie/450519 (The Fast and the Fierce).
const duplicateCredits = [
  { id: 1792850, name: "Joe Chambrello", character: "JC", profile_path: "/eOg1DNXbCM8vu4VO16bAKXJXmpV.jpg" },
  { id: 1792850, name: "Joe Chambrello", character: "J.C.", profile_path: "/eOg1DNXbCM8vu4VO16bAKXJXmpV.jpg" },
];

test("movie and TV details return one actor per ID without discarding distinct roles", () => {
  for (const type of ["movie", "tv"] as const) {
    const detail = normalizeDetail({ id: 450519, credits: { cast: duplicateCredits } }, type);
    assert.deepEqual(detail.cast, [{ id: 1792850, name: "Joe Chambrello", character: "JC / J.C.", profilePath: "/eOg1DNXbCM8vu4VO16bAKXJXmpV.jpg" }]);
  }
});

test("cached duplicate actors merge without mutating snapshots, changing order or repeating roles", () => {
  const cast = [
    { id: 8, name: "", character: "Hero", profilePath: null },
    { id: 3, name: "Other", character: "", profilePath: null },
    { id: 8, name: "Actor", character: " Hero ", profilePath: "/actor.jpg" },
    { id: 8, name: "Alternate name", character: "Villain", profilePath: null },
    { id: 10, name: "Actor", character: "Narrator", profilePath: null },
  ];
  const original = structuredClone(cast);
  const result = mergeCastMembers(cast);
  assert.deepEqual(result.map(person => person.id), [8, 3, 10]);
  assert.deepEqual(result[0], { id: 8, name: "Actor", character: "Hero / Villain", profilePath: "/actor.jpg" });
  assert.equal(result[1].character, "");
  assert.deepEqual(cast, original);
  assert.deepEqual(mergeCastMembers(result), result, "server and client can safely apply the same rule");
});

test("cast limits apply after merging so duplicate credits cannot displace other actors or later roles", () => {
  const cast = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, name: `Actor ${index + 1}`, character: "Lead" }));
  cast.splice(1, 0, cast[0]);
  cast.push({ id: 1, name: "Actor 1", character: "Second role" });
  const detail = normalizeDetail({ credits: { cast } }, "movie");
  assert.deepEqual(detail.cast.map(person => person.id), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(detail.cast[0].character, "Lead / Second role");
});

test("malformed person IDs and empty credits do not create ambiguous actor cards", () => {
  assert.deepEqual(mergeCastMembers([]), []);
  const invalid = [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(id => ({ id, name: "Actor", character: "", profilePath: null }));
  assert.deepEqual(mergeCastMembers(invalid), []);
});
