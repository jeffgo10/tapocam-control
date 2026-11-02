import { jsonError, readJson, errorMessage } from "@/lib/http";
import { registerRtspSource, publicStreamUrl } from "@/lib/mediamtx";
import { buildRtspUrl, redactSecrets } from "@/lib/rtsp";
import { parseCredentials } from "@/lib/validate";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);

  const credentials = parseCredentials(body);
  if (!credentials.ok) return jsonError(credentials.error, 400);

  const rtspUrl = buildRtspUrl(credentials.value);
  try {
    await registerRtspSource(rtspUrl);
  } catch (error) {
    const message = redactSecrets(errorMessage(error, "Could not register the stream."), [
      credentials.value.password,
      encodeURIComponent(credentials.value.password),
      rtspUrl,
    ]);
    return jsonError(message, 502);
  }

  return Response.json({ success: true, streamUrl: publicStreamUrl() });
}
