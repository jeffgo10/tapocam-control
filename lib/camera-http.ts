import { DatabaseUnavailable, getCamera, type CameraRecord } from "@/lib/cameras";
import { errorMessage, jsonError } from "@/lib/http";
import { redactSecrets } from "@/lib/rtsp";
import { parseCameraId } from "@/lib/validate";

export async function requireCamera(
  id: string,
): Promise<{ camera: CameraRecord } | { response: Response }> {
  const parsed = parseCameraId(id);
  if (!parsed.ok) return { response: jsonError(parsed.error, 400) };
  const camera = await getCamera(parsed.value);
  if (!camera) return { response: jsonError("Camera not found.", 404) };
  return { camera };
}

export function cameraFailure(error: unknown, password: string, fallback: string) {
  return jsonError(
    redactSecrets(errorMessage(error, fallback), [
      password,
      encodeURIComponent(password),
    ]),
    502,
  );
}

export async function withDatabase(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DatabaseUnavailable) return jsonError(error.message, 503);
    throw error;
  }
}
