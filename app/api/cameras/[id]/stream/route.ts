import { withDatabase, cameraFailure, requireCamera } from "@/lib/camera-http";
import { publicStreamUrl, registerRtspSource, streamPathFor } from "@/lib/mediamtx";
import { buildRtspUrl } from "@/lib/rtsp";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  return withDatabase(async () => {
    const found = await requireCamera(id);
    if ("response" in found) return found.response;

    const pathName = streamPathFor(found.camera.id);
    const rtspUrl = buildRtspUrl(found.camera);
    try {
      await registerRtspSource(rtspUrl, pathName);
    } catch (error) {
      return cameraFailure(error, found.camera.password, "Could not register the stream.");
    }
    return Response.json({ success: true, streamUrl: publicStreamUrl(pathName) });
  });
}
