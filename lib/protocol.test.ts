import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePresets } from "./presets.ts";
import { velocityFor, PTZ_SPEED } from "./ptz.ts";
import { buildRtspUrl } from "./rtsp.ts";
import { parseCameraCreate, parseCredentials, parsePresetRequest, parsePtzCommand } from "./validate.ts";
import { streamPathFor } from "./paths.ts";
import { activeCameraId, toggleWall, visibleCameraIds } from "./view.ts";

describe("rtsp url", () => {
  it("builds the Tapo main stream url and encodes credentials", () => {
    const url = buildRtspUrl({
      ip: "192.168.1.50",
      username: "cam",
      password: "p@ss:word",
    });
    assert.equal(url, "rtsp://cam:p%40ss%3Aword@192.168.1.50:554/stream1");
    assert.equal(
      buildRtspUrl({ ip: "192.168.1.50", username: "cam", password: "p@ss:word" }, "stream2"),
      "rtsp://cam:p%40ss%3Aword@192.168.1.50:554/stream2",
    );
  });
});

describe("ptz vectors", () => {
  it("maps directions to a 0.5 speed step", () => {
    assert.deepEqual(velocityFor("up"), { x: 0, y: PTZ_SPEED, z: 0 });
    assert.deepEqual(velocityFor("down"), { x: 0, y: -PTZ_SPEED, z: 0 });
    assert.deepEqual(velocityFor("left"), { x: -PTZ_SPEED, y: 0, z: 0 });
    assert.deepEqual(velocityFor("right"), { x: PTZ_SPEED, y: 0, z: 0 });
  });
});

describe("presets", () => {
  it("normalizes one preset or many, including text nodes", () => {
    assert.deepEqual(
      normalizePresets({
        GetPresetsResponse: {
          Preset: { $: { token: "1" }, Name: "Door" },
        },
      }),
      [{ name: "Door", token: "1" }],
    );

    assert.deepEqual(
      normalizePresets({
        GetPresetsResponse: {
          Preset: [
            { $: { token: "1" }, Name: { _: "Door" } },
            { $: { token: "2" }, Name: "Window" },
          ],
        },
      }),
      [
        { name: "Door", token: "1" },
        { name: "Window", token: "2" },
      ],
    );
  });

  it("returns an empty list when the camera has no presets", () => {
    assert.deepEqual(normalizePresets({ GetPresetsResponse: {} }), []);
  });
});

describe("request validation", () => {
  const creds = { ip: "192.168.1.50", username: "cam", password: "secret" };

  it("accepts a camera payload and rejects a port stuffed into ip", () => {
    assert.equal(parseCredentials(creds).ok, true);
    const rejected = parseCredentials({ ...creds, ip: "192.168.1.50:2020" });
    assert.equal(rejected.ok, false);
  });

  it("accepts the four ptz commands", () => {
    assert.equal(parsePtzCommand({ ...creds, command: "left" }).ok, true);
    assert.equal(parsePtzCommand({ ...creds, command: "zoom" }).ok, false);
  });

  it("requires a preset token only for goto", () => {
    assert.equal(parsePresetRequest({ ...creds, action: "list" }).ok, true);
    assert.equal(parsePresetRequest({ ...creds, action: "goto" }).ok, false);
    const goto = parsePresetRequest({
      ...creds,
      action: "goto",
      presetToken: "1",
    });
    assert.equal(goto.ok, true);
    if (goto.ok) assert.equal(goto.value.presetToken, "1");
  });

  it("accepts a saved camera and trims the name", () => {
    const created = parseCameraCreate({
      name: "  Door  ",
      ip: "192.168.1.50",
      username: "cam",
      password: "secret",
    });
    assert.equal(created.ok, true);
    if (created.ok) assert.equal(created.value.name, "Door");
  });
});

describe("multi camera view", () => {
  const cameras = ["a", "b", "c", "d", "e"];

  it("watches one camera, defaulting to the first saved camera", () => {
    assert.deepEqual(
      visibleCameraIds({ mode: "single", activeId: null, wallIds: [] }, cameras),
      ["a"],
    );
    assert.deepEqual(
      visibleCameraIds({ mode: "single", activeId: "c", wallIds: [] }, cameras),
      ["c"],
    );
  });

  it("shows only the checked cameras and stops at four", () => {
    assert.deepEqual(
      visibleCameraIds({ mode: "wall", activeId: "a", wallIds: ["b", "d"] }, cameras),
      ["b", "d"],
    );
    const full = toggleWall(["a", "b", "c", "d"], "e");
    assert.equal(full.error, "A wall can show up to 4 cameras.");
    assert.deepEqual(toggleWall(["a", "b"], "a").wallIds, ["b"]);
  });

  it("aims controls at a camera that is actually on the wall", () => {
    assert.equal(
      activeCameraId({ mode: "wall", activeId: "a", wallIds: ["b"] }, cameras),
      "b",
    );
    assert.equal(streamPathFor("11111111-1111-4111-8111-111111111111").startsWith("cam-"), true);
  });
});
