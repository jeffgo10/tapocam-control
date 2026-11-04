import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  listRecordingSegments,
  parseByteRange,
  parseSegmentStamp,
  resolveRecordingFile,
} from "./recordings.ts";

const cameraId = "11111111-1111-4111-8111-111111111111";

describe("recording files", () => {
  it("reads the local time stamped in the file name", () => {
    const start = parseSegmentStamp("2026-11-04_08-00-14-091175.mp4");
    assert.equal(start, new Date(2026, 10, 4, 8, 0, 14).getTime());
    assert.equal(parseSegmentStamp("../secret.mp4"), null);
  });

  it("rejects a path that leaves the camera folder", () => {
    const root = "/recordings";
    const name = "2026-11-04/08/2026-11-04_08-00-14-091175.mp4";
    const resolved = resolveRecordingFile(root, cameraId, name);
    assert.equal(
      resolved,
      path.resolve(root, `cam-${cameraId}`, name),
    );
    assert.equal(resolveRecordingFile(root, cameraId, "2026-11-04/08/../../secret.mp4"), null);
    assert.equal(resolveRecordingFile(root, "not-a-camera", name), null);
    assert.equal(
      resolveRecordingFile(root, cameraId, "2026-11-04/09/2026-11-04_08-00-14-091175.mp4"),
      null,
    );
  });

  it("parses a byte range", () => {
    assert.deepEqual(parseByteRange("bytes=0-1", 10), { start: 0, end: 1 });
    assert.deepEqual(parseByteRange("bytes=4-", 10), { start: 4, end: 9 });
    assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9 });
    assert.equal(parseByteRange("bytes=12-13", 10), "invalid");
    assert.equal(parseByteRange(null, 10), null);
  });

  it("lists one day in order and stops a segment where the next one starts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tapocam-recordings-"));
    const folder = path.join(root, `cam-${cameraId}`, "2026-11-04", "08");
    await mkdir(folder, { recursive: true });
    const first = path.join(folder, "2026-11-04_08-00-14-091175.mp4");
    const second = path.join(folder, "2026-11-04_08-01-14-091175.mp4");
    await writeFile(first, "a");
    await writeFile(second, "b");
    const firstStart = new Date(2026, 10, 4, 8, 0, 14);
    const secondStart = new Date(2026, 10, 4, 8, 1, 14);
    await utimes(first, firstStart, new Date(firstStart.getTime() + 90_000));
    await utimes(second, secondStart, new Date(secondStart.getTime() + 60_000));
    try {
      const segments = await listRecordingSegments(root, cameraId, "2026-11-04");
      assert.ok(segments);
      assert.equal(segments.length, 2);
      assert.equal(segments[0].start, firstStart.getTime());
      assert.equal(segments[0].end, secondStart.getTime());
      assert.equal(segments[1].end, secondStart.getTime() + 60_000);
      assert.equal(await listRecordingSegments(root, "nope", "2026-11-04"), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
