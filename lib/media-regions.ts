const names = new Intl.DisplayNames(["zh-CN"], { type: "region", fallback: "none" });
const overrides: Record<string, string> = { CN: "中国大陆", HK: "中国香港", TW: "中国台湾", MO: "中国澳门", US: "美国", GB: "英国", KR: "韩国" };

export function normalizeCountryCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((code): code is string => typeof code === "string")
    .map(code => code.trim().toUpperCase())
    .filter(code => /^[A-Z]{2}$/.test(code) && code !== "ZZ" && Boolean(names.of(code))))];
}

export function countryNames(codes: unknown): string[] {
  return normalizeCountryCodes(codes).map(code => overrides[code] || names.of(code)!);
}

export function formatRegions(codes: unknown): string {
  return countryNames(codes).join(" / ");
}
