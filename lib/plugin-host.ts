import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isPluginId, parseManifest, type PluginManifest } from "@/lib/plugin-manifest";
import type { PluginListing, PluginSettingsView } from "@/lib/plugin-types";

type PluginModule = {
  activate: (options: { pluginRoot: string; recordingsDir: string }) => Promise<void>;
  deactivate: () => Promise<void>;
  getSettings?: () => Promise<PluginSettingsView>;
  setCameraEnabled?: (cameraId: string, enabled: boolean) => Promise<void>;
};

type Slot = {
  modules: Map<string, PluginModule>;
  errors: Map<string, string>;
};

const SKIP = new Set(["node_modules", "data", ".git", ".env"]);

function slot(): Slot {
  const store = globalThis as typeof globalThis & { __tapocamPlugins?: Slot };
  if (!store.__tapocamPlugins) {
    store.__tapocamPlugins = { modules: new Map(), errors: new Map() };
  }
  return store.__tapocamPlugins;
}

export function catalogDirectory(): string {
  const configured = process.env.PLUGIN_CATALOG?.trim();
  if (configured) return path.resolve(process.cwd(), configured);
  return path.resolve(process.cwd(), "../tapocam-extends/plugins");
}

function installedRoot(): string {
  return path.join(process.cwd(), "plugins");
}

function registryPath(): string {
  return path.join(process.cwd(), "data", "plugins.json");
}

export async function readActive(): Promise<string[]> {
  try {
    const body = JSON.parse(await readFile(registryPath(), "utf8")) as { active?: unknown };
    if (!Array.isArray(body.active)) return [];
    return body.active.filter((id): id is string => typeof id === "string" && isPluginId(id));
  } catch {
    return [];
  }
}

async function writeActive(active: string[]): Promise<void> {
  const file = registryPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ active }, null, 2)}\n`);
}

async function manifestsIn(dir: string): Promise<PluginManifest[]> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const found: PluginManifest[] = [];
  for (const name of names) {
    const manifest = await readManifest(path.join(dir, name), name);
    if (manifest) found.push(manifest);
  }
  return found;
}

async function readManifest(folder: string, folderName: string): Promise<PluginManifest | null> {
  if (!isPluginId(folderName)) return null;
  try {
    const text = await readFile(path.join(folder, "tapocam.plugin.json"), "utf8");
    return parseManifest(JSON.parse(text) as unknown, folderName);
  } catch {
    return null;
  }
}

function canCopy(source: string, from: string): boolean {
  const relative = path.relative(from, source);
  if (relative === "" || relative === ".") return true;
  return relative.split(path.sep).every((part) => !SKIP.has(part));
}

export async function installPlugin(id: string): Promise<void> {
  if (!isPluginId(id)) throw new Error("Plugin id is invalid.");
  const source = path.join(catalogDirectory(), id);
  const destination = path.join(installedRoot(), id);
  if (path.resolve(source) === path.resolve(destination)) {
    throw new Error("Plugin is already inside the app.");
  }
  const manifest = await readManifest(source, id);
  if (!manifest) throw new Error("Plugin was not found in the catalog.");
  if (await readManifest(destination, id)) throw new Error("Plugin is already installed.");
  await mkdir(installedRoot(), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (item) => canCopy(item, source),
  });
}

export async function activatePlugin(id: string): Promise<void> {
  const manifest = await readManifest(path.join(installedRoot(), id), id);
  if (!manifest) throw new Error("Install the plugin first.");
  const active = await readActive();
  if (!active.includes(id)) await writeActive([...active, id]);
  try {
    await ensurePlugin(manifest);
    slot().errors.delete(id);
  } catch (error) {
    slot().errors.set(id, error instanceof Error ? error.message : "Could not activate the plugin.");
    await writeActive((await readActive()).filter((item) => item !== id));
    throw error;
  }
}

export async function deactivatePlugin(id: string): Promise<void> {
  if (!isPluginId(id)) throw new Error("Plugin id is invalid.");
  const loaded = slot().modules.get(id);
  if (loaded) await loaded.deactivate();
  slot().modules.delete(id);
  slot().errors.delete(id);
  await writeActive((await readActive()).filter((item) => item !== id));
}

export async function uninstallPlugin(id: string): Promise<void> {
  if (!isPluginId(id)) throw new Error("Plugin id is invalid.");
  await deactivatePlugin(id);
  await rm(path.join(installedRoot(), id), { recursive: true, force: true });
}

export async function setPluginCamera(id: string, cameraId: string, enabled: boolean): Promise<void> {
  const loaded = slot().modules.get(id);
  if (!loaded?.setCameraEnabled) throw new Error("Activate the plugin first.");
  await loaded.setCameraEnabled(cameraId, enabled);
}

export async function ensureActivePlugins(): Promise<void> {
  const active = await readActive();
  for (const id of active) {
    const manifest = await readManifest(path.join(installedRoot(), id), id);
    if (!manifest) continue;
    try {
      await ensurePlugin(manifest);
      slot().errors.delete(id);
    } catch (error) {
      slot().errors.set(id, error instanceof Error ? error.message : "Could not start the plugin.");
    }
  }
}

export async function listPlugins(): Promise<PluginListing[]> {
  await ensureActivePlugins();
  const catalog = await manifestsIn(catalogDirectory());
  const installed = await manifestsIn(installedRoot());
  const active = new Set(await readActive());
  const byId = new Map<string, PluginManifest>();
  for (const manifest of catalog) byId.set(manifest.id, manifest);
  for (const manifest of installed) byId.set(manifest.id, manifest);
  const plugins: PluginListing[] = [];
  for (const manifest of byId.values()) {
    const isActive = active.has(manifest.id);
    const loaded = slot().modules.get(manifest.id);
    let settings: PluginSettingsView | null = null;
    if (isActive && loaded?.getSettings) settings = await loaded.getSettings();
    else if (isActive && slot().errors.get(manifest.id)) {
      settings = {
        summary: "",
        error: slot().errors.get(manifest.id) ?? "Could not start the plugin.",
        cameras: [],
      };
    }
    plugins.push({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      installed: installed.some((item) => item.id === manifest.id),
      active: isActive,
      settings,
    });
  }
  return plugins.sort((left, right) => left.name.localeCompare(right.name));
}

async function ensurePlugin(manifest: PluginManifest): Promise<PluginModule> {
  const existing = slot().modules.get(manifest.id);
  if (existing) return existing;
  const pluginRoot = path.resolve(installedRoot(), manifest.id);
  const entry = path.resolve(pluginRoot, manifest.entry);
  if (entry !== pluginRoot && !entry.startsWith(`${pluginRoot}${path.sep}`)) {
    throw new Error("Plugin entry is invalid.");
  }
  const imported = await importPlugin(pathToFileURL(entry).href);
  const activate = imported.activate;
  const deactivate = imported.deactivate;
  if (typeof activate !== "function" || typeof deactivate !== "function") {
    throw new Error("Plugin must export activate and deactivate.");
  }
  const loaded: PluginModule = {
    activate: activate as PluginModule["activate"],
    deactivate: deactivate as PluginModule["deactivate"],
    getSettings:
      typeof imported.getSettings === "function"
        ? (imported.getSettings as PluginModule["getSettings"])
        : undefined,
    setCameraEnabled:
      typeof imported.setCameraEnabled === "function"
        ? (imported.setCameraEnabled as PluginModule["setCameraEnabled"])
        : undefined,
  };
  await loaded.activate({
    pluginRoot,
    recordingsDir: path.join(process.cwd(), "recordings"),
  });
  slot().modules.set(manifest.id, loaded);
  return loaded;
}

async function importPlugin(specifier: string): Promise<Record<string, unknown>> {
  const nativeImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  return nativeImport(specifier);
}
