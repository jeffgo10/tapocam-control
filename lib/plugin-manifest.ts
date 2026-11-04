const PLUGIN_ID = /^[a-z][a-z0-9-]{0,40}$/;

export type PluginManifest = {
  id: string;
  name: string;
  description: string;
  entry: string;
};

export function isPluginId(id: string): boolean {
  return PLUGIN_ID.test(id);
}

export function parseManifest(value: unknown, folderName: string): PluginManifest | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id !== folderName || !isPluginId(item.id)) return null;
  if (typeof item.name !== "string" || item.name.trim() === "") return null;
  if (typeof item.description !== "string") return null;
  if (typeof item.entry !== "string" || !isSafeEntry(item.entry)) return null;
  return {
    id: item.id,
    name: item.name.trim(),
    description: item.description.trim(),
    entry: item.entry,
  };
}

function isSafeEntry(entry: string): boolean {
  if (entry.startsWith("/") || entry.includes("..")) return false;
  if (!/^[\w./-]+$/.test(entry)) return false;
  return entry.endsWith(".js") || entry.endsWith(".mjs") || entry.endsWith(".ts");
}
