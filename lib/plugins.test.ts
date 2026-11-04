import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseManifest } from "./plugin-manifest.ts";

const manifest = {
  id: "record",
  name: "Recording",
  description: "Save cameras.",
  entry: "src/host.ts",
};

describe("plugin manifest", () => {
  it("accepts a plugin whose id matches its folder", () => {
    assert.deepEqual(parseManifest(manifest, "record"), manifest);
  });

  it("rejects a different folder name, a parent path, and an absolute entry", () => {
    assert.equal(parseManifest(manifest, "other"), null);
    assert.equal(parseManifest({ ...manifest, entry: "../host.ts" }, "record"), null);
    assert.equal(parseManifest({ ...manifest, entry: "/tmp/host.ts" }, "record"), null);
    assert.equal(parseManifest({ ...manifest, id: "../record" }, "../record"), null);
  });
});
