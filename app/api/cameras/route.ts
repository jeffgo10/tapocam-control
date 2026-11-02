import { connection } from "next/server";
import { withDatabase } from "@/lib/camera-http";
import { createCamera, listCameras, toPublic } from "@/lib/cameras";
import { jsonError, readJson } from "@/lib/http";
import { parseCameraCreate } from "@/lib/validate";

export async function GET() {
  await connection();
  return withDatabase(async () =>
    Response.json({ success: true, cameras: await listCameras() }),
  );
}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return jsonError("Request body must be JSON.", 400);
  const parsed = parseCameraCreate(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  return withDatabase(async () => {
    const camera = await createCamera(parsed.value);
    return Response.json({ success: true, camera: toPublic(camera) }, { status: 201 });
  });
}
