import { connection } from "next/server";
import { jsonError } from "@/lib/http";
import { listRecordingSegments, recordingsRoot } from "@/lib/recordings";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  await connection();
  const { id } = await context.params;
  const day = new URL(request.url).searchParams.get("day") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return jsonError("Day is invalid.", 400);
  const segments = await listRecordingSegments(recordingsRoot(), id, day);
  if (!segments) return jsonError("Camera was not found.", 404);
  return Response.json({ success: true, day, segments });
}
