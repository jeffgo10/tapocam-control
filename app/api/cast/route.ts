import { withDatabase, requireCamera } from "@/lib/camera-http";
import { prepareCast, stopCastMosaic } from "@/lib/cast-mosaic";
import { parseCastRequest } from "@/lib/cast-media";
import type { CameraRecord } from "@/lib/cameras";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { redactSecrets } from "@/lib/rtsp";

export async function POST(request: Request) {
  const parsed = parseCastRequest(await readJson(request));
  if (!parsed.ok) return jsonError(parsed.error, 400);

  return withDatabase(async () => {
    const cameras: CameraRecord[] = [];
    for (const id of parsed.value.cameraIds) {
      const found = await requireCamera(id);
      if ("response" in found) return found.response;
      cameras.push(found.camera);
    }

    try {
      const stream = await prepareCast(cameras, parsed.value.beat);
      return Response.json({ success: true, ...stream });
    } catch (error) {
      const secrets = cameras.flatMap((camera) => [
        camera.password,
        encodeURIComponent(camera.password),
      ]);
      return jsonError(
        redactSecrets(errorMessage(error, "Could not prepare the cast stream."), secrets),
        502,
      );
    }
  });
}

export async function DELETE() {
  try {
    await stopCastMosaic(true);
  } catch (error) {
    return jsonError(errorMessage(error, "Could not stop the cast stream."), 502);
  }
  return Response.json({ success: true });
}
