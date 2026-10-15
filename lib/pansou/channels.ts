import type { ResourceChannel } from "./types";
export const RESOURCE_CHANNELS: ReadonlyArray<{ id: ResourceChannel; label: string; shortLabel: string; color: string; icon?: string }> = [
  { id: "115", icon: "/icons/resource-channels/115.svg", label: "115网盘", shortLabel: "115", color: "#428be8" },
  { id: "aliyun", icon: "/icons/resource-channels/aliyun.svg", label: "阿里云盘", shortLabel: "阿里", color: "#7759ed" },
  { id: "quark", icon: "/icons/resource-channels/quark.svg", label: "夸克网盘", shortLabel: "夸克", color: "#5474ef" },
  { id: "baidu", icon: "/icons/resource-channels/baidu.svg", label: "百度网盘", shortLabel: "百度", color: "#4085ff" },
  { id: "123", icon: "/icons/resource-channels/123.svg", label: "123网盘", shortLabel: "123", color: "#477ade" },
  { id: "xunlei", icon: "/icons/resource-channels/xunlei.svg", label: "迅雷网盘", shortLabel: "迅雷", color: "#478ce9" },
  { id: "guangya", icon: "/icons/resource-channels/guangya.svg", label: "光鸭云盘", shortLabel: "光鸭", color: "#f2ae22" },
  { id: "uc", icon: "/icons/resource-channels/uc.svg", label: "UC网盘", shortLabel: "UC", color: "#e88934" },
  { id: "tianyi", icon: "/icons/resource-channels/tianyi.svg", label: "天翼云盘", shortLabel: "天翼", color: "#e87935" },
  { id: "mobile", icon: "/icons/resource-channels/mobile.svg", label: "移动云盘", shortLabel: "移动", color: "#399fd4" },
  { id: "pikpak", icon: "/icons/resource-channels/pikpak.png", label: "PikPak", shortLabel: "P", color: "#765be4" },
  { id: "magnet", label: "磁力链接", shortLabel: "磁力", color: "#b77752" },
  { id: "ed2k", label: "电驴链接", shortLabel: "电驴", color: "#8792a7" },
];
