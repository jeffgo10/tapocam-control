import { connection } from "next/server";
import {
  activatePlugin,
  deactivatePlugin,
  installPlugin,
  listPlugins,
  setPluginCamera,
  setPluginInterval,
  setPluginKeep,
  setPluginPresets,
  uninstallPlugin,
} from "@/lib/plugin-host";
import { errorMessage, jsonError, readJson } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    return Response.json({ success: true, plugins: await listPlugins() });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not load plugins."), 500);
  }
}

export async function POST(request: Request) {
  await connection();
  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Request body must be JSON.", 400);
  const record = body as {
    action?: unknown;
    id?: unknown;
    cameraId?: unknown;
    enabled?: unknown;
    amount?: unknown;
    unit?: unknown;
    seconds?: unknown;
    tokens?: unknown;
  };
  if (typeof record.id !== "string") return jsonError("Plugin id is required.", 400);
  try {
    if (record.action === "install") await installPlugin(record.id);
    else if (record.action === "activate") await activatePlugin(record.id);
    else if (record.action === "deactivate") await deactivatePlugin(record.id);
    else if (record.action === "uninstall") await uninstallPlugin(record.id);
    else if (record.action === "camera") {
      if (typeof record.cameraId !== "string" || typeof record.enabled !== "boolean") {
        return jsonError("Camera choice is invalid.", 400);
      }
      await setPluginCamera(record.id, record.cameraId, record.enabled);
    } else if (record.action === "keep") {
      if (
        typeof record.cameraId !== "string" ||
        typeof record.amount !== "number" ||
        typeof record.unit !== "string"
      ) {
        return jsonError("Keep choice is invalid.", 400);
      }
      await setPluginKeep(record.id, record.cameraId, record.amount, record.unit);
    } else if (record.action === "interval") {
      if (typeof record.cameraId !== "string" || typeof record.seconds !== "number") {
        return jsonError("Interval is invalid.", 400);
      }
      await setPluginInterval(record.id, record.cameraId, record.seconds);
    } else if (record.action === "presets") {
      if (typeof record.cameraId !== "string" || !isPresetSelection(record.tokens)) {
        return jsonError("Preset choice is invalid.", 400);
      }
      await setPluginPresets(record.id, record.cameraId, record.tokens);
    } else return jsonError("Plugin action is invalid.", 400);
    return Response.json({ success: true, plugins: await listPlugins() });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not update the plugin."), 400);
  }
}

function isPresetSelection(value: unknown): value is string[] | null {
  if (value === null) return true;
  if (!Array.isArray(value) || value.length > 32) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "" || item.length > 128 || seen.has(item)) return false;
    if (/[\u0000-\u001F\u007F]/.test(item)) return false;
    seen.add(item);
  }
  return true;
}
