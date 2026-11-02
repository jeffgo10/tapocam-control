import { withDatabase, cameraFailure, requireCamera } from "@/lib/camera-http";
import { jsonError, readJson } from "@/lib/http";
import { moveCamera } from "@/lib/onvif-client";
import { parseCommand } from "@/lib/validate";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);
  const command = parseCommand(body);
  if (!command.ok) return jsonError(command.error, 400);

  return withDatabase(async () => {
    const found = await requireCamera(id);
    if ("response" in found) return found.response;
    try {
      await moveCamera(found.camera, command.value);
    } catch (error) {
      return cameraFailure(error, found.camera.password, "PTZ command failed.");
    }
    return Response.json({ success: true });
  });
}
