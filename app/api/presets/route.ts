import { errorMessage, jsonError, readJson } from "@/lib/http";
import { gotoPreset, listPresets } from "@/lib/onvif-client";
import { redactSecrets } from "@/lib/rtsp";
import { parsePresetRequest } from "@/lib/validate";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);

  const parsed = parsePresetRequest(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  try {
    if (parsed.value.action === "list") {
      const presets = await listPresets(parsed.value);
      return Response.json({ success: true, presets });
    }

    await gotoPreset(parsed.value, parsed.value.presetToken ?? "");
    return Response.json({ success: true });
  } catch (error) {
    const message = redactSecrets(errorMessage(error, "Preset request failed."), [
      parsed.value.password,
    ]);
    return jsonError(message, 502);
  }
}
