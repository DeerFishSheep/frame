export type ResourceChannel = "baidu" | "aliyun" | "quark" | "tianyi" | "uc" | "mobile" | "115" | "pikpak" | "xunlei" | "123" | "magnet" | "ed2k" | "others";
export interface ResourceSearchQuery { keyword: string; channels: ResourceChannel[]; }
export interface ResourceItem {
  id: string;
  channel: ResourceChannel;
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  extractionCode: string;
}
export interface ResourceSearchResult extends ResourceSearchQuery {
  items: ResourceItem[];
  retrievedAt: string;
  /** Number of usable, deduplicated items in this response snapshot. */
  total: number;
}
