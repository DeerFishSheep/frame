import type { ResourceChannel } from "./types";
export const RESOURCE_CHANNELS: ReadonlyArray<{ id: ResourceChannel; label: string; shortLabel: string; color: string }> = [
  { id: "baidu", label: "百度网盘", shortLabel: "百度", color: "#4085ff" },
  { id: "aliyun", label: "阿里云盘", shortLabel: "阿里", color: "#7759ed" },
  { id: "quark", label: "夸克网盘", shortLabel: "夸克", color: "#5474ef" },
  { id: "tianyi", label: "天翼云盘", shortLabel: "天翼", color: "#e87935" },
  { id: "uc", label: "UC网盘", shortLabel: "UC", color: "#e88934" },
  { id: "mobile", label: "移动云盘", shortLabel: "移动", color: "#399fd4" },
  { id: "115", label: "115网盘", shortLabel: "115", color: "#428be8" },
  { id: "pikpak", label: "PikPak", shortLabel: "P", color: "#765be4" },
  { id: "xunlei", label: "迅雷网盘", shortLabel: "迅雷", color: "#478ce9" },
  { id: "123", label: "123网盘", shortLabel: "123", color: "#477ade" },
  { id: "magnet", label: "磁力链接", shortLabel: "磁力", color: "#b77752" },
  { id: "ed2k", label: "电驴链接", shortLabel: "电驴", color: "#8792a7" },
  { id: "others", label: "其他", shortLabel: "其他", color: "#8b94a2" },
];
