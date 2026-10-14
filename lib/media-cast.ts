import type { MediaDetail } from "./types";

type CastMember = MediaDetail["cast"][number];

/** One card per person, with every distinct credited role in its original order. */
export function mergeCastMembers(cast: readonly CastMember[]): CastMember[] {
  const people = new Map<number, { actor: CastMember; characters: Set<string> }>();
  for (const member of cast) {
    if (!Number.isSafeInteger(member.id) || member.id <= 0) continue;
    let person = people.get(member.id);
    if (!person) {
      person = { actor: { ...member, name: member.name.trim() }, characters: new Set() };
      people.set(member.id, person);
    }
    if (!person.actor.name) person.actor.name = member.name.trim();
    if (!person.actor.profilePath) person.actor.profilePath = member.profilePath;
    const character = member.character.trim();
    if (character) person.characters.add(character);
  }
  return [...people.values()].map(({ actor, characters }) => ({ ...actor, character: [...characters].join(" / ") }));
}
