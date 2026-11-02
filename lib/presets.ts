import type { Preset } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isRecord(value) && typeof value._ === "string") return value._.trim();
  return "";
}

export function normalizePresets(data: unknown): Preset[] {
  if (!isRecord(data)) return [];
  const response = data.GetPresetsResponse;
  if (!isRecord(response)) return [];

  const raw = response.Preset;
  const items = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];

  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const attributes = isRecord(item.$) ? item.$ : {};
    const token =
      textValue(attributes.token) ||
      textValue(attributes.PresetToken) ||
      textValue(item.token);
    if (!token) return [];
    const name = textValue(item.Name) || `Preset ${token}`;
    return [{ name, token }];
  });
}
