import { connection } from "next/server";
import {
  activatePlugin,
  deactivatePlugin,
  installPlugin,
  listPlugins,
  setPluginCamera,
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
  const record = body as { action?: unknown; id?: unknown; cameraId?: unknown; enabled?: unknown };
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
    } else return jsonError("Plugin action is invalid.", 400);
    return Response.json({ success: true, plugins: await listPlugins() });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not update the plugin."), 400);
  }
}
