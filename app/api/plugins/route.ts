import { connection } from "next/server";
import {
  activatePlugin,
  deactivatePlugin,
  installPlugin,
  listPlugins,
  setPluginCamera,
  setPluginInterval,
  setPluginKeep,
  setPluginPresetInterval,
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
    token?: unknown;
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
    } else if (record.action === "preset-interval") {
      if (
        typeof record.cameraId !== "string" ||
        !isPresetToken(record.token) ||
        !isPresetWait(record.seconds)
      ) {
        return jsonError("Preset wait is invalid.", 400);
      }
      await setPluginPresetInterval(record.id, record.cameraId, record.token, record.seconds);
    } else return jsonError("Plugin action is invalid.", 400);
    return Response.json({ success: true, plugins: await listPlugins() });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not update the plugin."), 400);
  }
}

function isPresetToken(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= 128 && !/[\u0000-\u001F\u007F]/.test(value);
}

function isPresetWait(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isPresetSelection(value: unknown): value is string[] | null {
  if (value === null) return true;
  if (!Array.isArray(value) || value.length > 32) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isPresetToken(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}
