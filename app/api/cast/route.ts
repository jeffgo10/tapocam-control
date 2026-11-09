import { connection } from "next/server";
import { withDatabase, requireCamera } from "@/lib/camera-http";
import { findCastEndpoint, findCastModel, listCastDevices } from "@/lib/cast-discovery";
import { castEpoch, prepareCast, stopCastMosaic } from "@/lib/cast-mosaic";
import { chooseCastOverscan, parseCastRequest } from "@/lib/cast-media";
import type { CameraRecord } from "@/lib/cameras";
import { playOnCastDevice } from "@/lib/cast-sender";
import { errorMessage, jsonError, readJson } from "@/lib/http";
import { redactSecrets } from "@/lib/rtsp";

export async function GET() {
  await connection();
  try {
    return Response.json({ success: true, devices: await listCastDevices() });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not look for a Nest display."), 502);
  }
}

export async function POST(request: Request) {
  const parsed = parseCastRequest(await readJson(request));
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const epoch = castEpoch();

  return withDatabase(async () => {
    const cameras: CameraRecord[] = [];
    for (const id of parsed.value.cameraIds) {
      const found = await requireCamera(id);
      if ("response" in found) return found.response;
      cameras.push(found.camera);
    }

    try {
      const server = parsed.value.sender === "server";
      const located =
        server && !parsed.value.beat ? await findCastEndpoint(parsed.value.deviceName) : null;
      if (server && !parsed.value.beat && !located) {
        return jsonError("That Nest display is not on this Wi-Fi anymore.", 404);
      }
      const overscan = parsed.value.beat
        ? parsed.value.overscan
        : chooseCastOverscan(
            located?.model ?? (server ? null : await findCastModel(parsed.value.deviceName)),
            parsed.value.hdmi,
          );
      if (castEpoch() !== epoch || request.signal.aborted) {
        return jsonError("Cast was stopped.", 409);
      }
      const stream = await prepareCast(cameras, {
        beat: parsed.value.beat,
        overscan,
      });
      if (castEpoch() !== epoch || request.signal.aborted) {
        if (!parsed.value.beat) await stopCastMosaic(true);
        return jsonError("Cast was stopped.", 409);
      }
      if (server && (!parsed.value.beat || stream.restarted)) {
        try {
          await playOnCastDevice(
            parsed.value.deviceName,
            { url: stream.hlsUrl, title: stream.title, startAt: stream.startAt },
            located,
          );
        } catch (error) {
          if (!parsed.value.beat && castEpoch() === epoch) await stopCastMosaic(true);
          throw error;
        }
      }
      if (castEpoch() !== epoch) {
        await stopCastMosaic(true);
        return jsonError("Cast was stopped.", 409);
      }
      return Response.json({ success: true, ...stream, overscan });
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
