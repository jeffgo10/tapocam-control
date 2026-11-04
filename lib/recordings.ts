import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const CAMERA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^([01]\d|2[0-3])$/;
const SEGMENT =
  /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d+)\.mp4$/;
const MAX_SEGMENT_MS = 2 * 60 * 60 * 1000;

export type RecordingSegment = {
  name: string;
  start: number;
  end: number;
};

export type ByteRange = { start: number; end: number };

export function recordingsRoot(): string {
  return path.join(process.cwd(), "recordings");
}

export function parseSegmentStamp(fileName: string): number | null {
  const match = SEGMENT.exec(fileName);
  if (!match) return null;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Number(match[1]), month - 1, day, hour, minute, second).getTime();
}

function formatDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function segmentRelativeName(day: string, hour: string, fileName: string): string | null {
  if (!DAY.test(day) || !HOUR.test(hour)) return null;
  const start = parseSegmentStamp(fileName);
  if (start === null) return null;
  const when = new Date(start);
  const pad = (value: number) => String(value).padStart(2, "0");
  if (formatDay(when) !== day || pad(when.getHours()) !== hour) return null;
  return `${day}/${hour}/${fileName}`;
}

export function resolveRecordingFile(root: string, cameraId: string, name: string): string | null {
  if (!CAMERA_ID.test(cameraId)) return null;
  const parts = name.split("/");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  const relative = segmentRelativeName(parts[0], parts[1], parts[2]);
  if (relative !== name) return null;
  const folder = path.resolve(root, `cam-${cameraId}`);
  const full = path.resolve(folder, relative);
  if (full !== path.join(folder, relative)) return null;
  return full;
}

export function parseByteRange(header: string | null, size: number): ByteRange | "invalid" | null {
  if (!header || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function listRecordingSegments(
  root: string,
  cameraId: string,
  day: string,
): Promise<RecordingSegment[] | null> {
  if (!CAMERA_ID.test(cameraId) || !DAY.test(day)) return null;
  const dayDir = path.join(root, `cam-${cameraId}`, day);
  let hours: string[] = [];
  try {
    hours = await readdir(dayDir);
  } catch {
    return [];
  }
  const segments: RecordingSegment[] = [];
  for (const hour of hours) {
    if (!HOUR.test(hour)) continue;
    let names: string[] = [];
    try {
      names = await readdir(path.join(dayDir, hour));
    } catch {
      continue;
    }
    for (const fileName of names) {
      const relative = segmentRelativeName(day, hour, fileName);
      if (!relative) continue;
      try {
        const info = await stat(path.join(dayDir, hour, fileName));
        if (!info.isFile()) continue;
        const start = parseSegmentStamp(fileName);
        if (start === null) continue;
        const elapsed = info.mtimeMs - start;
        const end = elapsed > 0 && elapsed <= MAX_SEGMENT_MS ? info.mtimeMs : start + 60_000;
        segments.push({ name: relative, start, end });
      } catch {
        // A file can disappear while the day is being listed.
      }
    }
  }
  segments.sort((left, right) => left.start - right.start || left.name.localeCompare(right.name));
  for (let index = 0; index < segments.length - 1; index += 1) {
    const nextStart = segments[index + 1].start;
    if (segments[index].end > nextStart) segments[index].end = Math.max(segments[index].start + 1, nextStart);
  }
  return segments;
}
