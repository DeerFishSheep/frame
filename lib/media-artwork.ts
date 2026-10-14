import { imageUrl, type Media } from "./types";

export function doubanImageUrl(value: string) {
  const approved = imageUrl(value);
  if (!approved || approved.length > 4096) return null;
  const url = new URL(approved);
  return /\.doubanio\.com$/.test(url.hostname) ? url.href : null;
}

export function artworkSources(item: Pick<Media, "posterPath" | "backdropPath" | "posterFallbacks">, backdrop = false) {
  const paths = backdrop ? [item.backdropPath, item.posterPath, ...(item.posterFallbacks || [])] : [item.posterPath, ...(item.posterFallbacks || [])];
  return [...new Set(paths.flatMap(path => {
    if (!path) return [];
    const douban = doubanImageUrl(path), src = imageUrl(path, backdrop ? "w1280" : "w500");
    return douban ? [`/api/images/douban?url=${encodeURIComponent(douban)}`] : src ? [src] : [];
  }))];
}
