import { RESOURCE_CHANNELS } from "./pansou/channels";
import type { ResourceChannel } from "./pansou/types";

const LEGACY_CHANNELS = ["baidu", "aliyun", "quark", "tianyi", "uc", "mobile", "115", "pikpak", "xunlei", "123", "magnet", "ed2k", "others"];

/** Preserve meaningful old selections without equating the retired 'others' channel with Guangya. */
export function normalizeResourceChannels(saved: unknown): ResourceChannel[] {
  const available = RESOURCE_CHANNELS.map(channel => channel.id);
  if (!Array.isArray(saved)) return available;
  if (LEGACY_CHANNELS.every(channel => saved.includes(channel))) return available;
  const selected = available.filter(channel => saved.includes(channel));
  return selected.length ? selected : available;
}
