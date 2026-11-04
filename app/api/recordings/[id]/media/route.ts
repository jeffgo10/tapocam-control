import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { connection } from "next/server";
import { jsonError } from "@/lib/http";
import { parseByteRange, recordingsRoot, resolveRecordingFile } from "@/lib/recordings";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  await connection();
  const { id } = await context.params;
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const full = resolveRecordingFile(recordingsRoot(), id, name);
  if (!full) return jsonError("Recording was not found.", 404);
  let size = 0;
  try {
    const info = await stat(full);
    if (!info.isFile()) return jsonError("Recording was not found.", 404);
    size = info.size;
  } catch {
    return jsonError("Recording was not found.", 404);
  }
  if (size === 0) {
    return new Response(null, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": "0",
        "Content-Type": "video/mp4",
      },
    });
  }
  const range = parseByteRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const node = createReadStream(full, { start, end });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Length": String(end - start + 1),
    "Content-Type": "video/mp4",
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return new Response(Readable.toWeb(node) as ReadableStream, {
    status: range ? 206 : 200,
    headers,
  });
}
