import { withDatabase, cameraFailure, requireCamera } from "@/lib/camera-http";
import { jsonError, readJson } from "@/lib/http";
import { gotoPreset, listPresets } from "@/lib/onvif-client";
import { parsePresetAction } from "@/lib/validate";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);
  const parsed = parsePresetAction(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  return withDatabase(async () => {
    const found = await requireCamera(id);
    if ("response" in found) return found.response;
    try {
      if (parsed.value.action === "list") {
        const presets = await listPresets(found.camera);
        return Response.json({ success: true, presets });
      }
      await gotoPreset(found.camera, parsed.value.presetToken ?? "");
      return Response.json({ success: true });
    } catch (error) {
      return cameraFailure(error, found.camera.password, "Preset request failed.");
    }
  });
}
