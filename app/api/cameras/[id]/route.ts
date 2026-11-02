import { withDatabase, cameraFailure, requireCamera } from "@/lib/camera-http";
import { deleteCamera, toPublic, updateCamera } from "@/lib/cameras";
import { jsonError, readJson } from "@/lib/http";
import { removeRtspSource, streamPathFor } from "@/lib/mediamtx";
import { parseCameraPatch } from "@/lib/validate";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);
  const parsed = parseCameraPatch(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  return withDatabase(async () => {
    const found = await requireCamera(id);
    if ("response" in found) return found.response;
    const updated = await updateCamera(found.camera.id, parsed.value);
    if (!updated) return jsonError("Camera not found.", 404);
    return Response.json({ success: true, camera: toPublic(updated) });
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return withDatabase(async () => {
    const found = await requireCamera(id);
    if ("response" in found) return found.response;
    await deleteCamera(found.camera.id);
    try {
      await removeRtspSource(streamPathFor(found.camera.id));
    } catch (error) {
      return cameraFailure(
        error,
        found.camera.password,
        "Camera deleted, but the stream could not be removed.",
      );
    }
    return Response.json({ success: true });
  });
}
