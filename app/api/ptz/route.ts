import { errorMessage, jsonError, readJson } from "@/lib/http";
import { moveCamera } from "@/lib/onvif-client";
import { redactSecrets } from "@/lib/rtsp";
import { parsePtzCommand } from "@/lib/validate";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);

  const command = parsePtzCommand(body);
  if (!command.ok) return jsonError(command.error, 400);

  try {
    await moveCamera(command.value, command.value.command);
  } catch (error) {
    const message = redactSecrets(errorMessage(error, "PTZ command failed."), [
      command.value.password,
    ]);
    return jsonError(message, 502);
  }

  return Response.json({ success: true });
}
