import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { castAdvertisements, encodeDnsName, matchCastModel } from "./cast-discovery.ts";
import { castModelNeedsOverscan, chooseCastOverscan } from "./cast-media.ts";

describe("cast device model", () => {
  it("reads the model from a Cast advertisement, not the chosen name", () => {
    const packet = txtResponse([
      ["fn=Chromecast", "md=Chromecast"],
      ["fn=Office display", "md=Google Nest Hub"],
      ["fn=Google TV", "md=Smart TV"],
    ]);
    const devices = castAdvertisements(packet);
    assert.equal(matchCastModel(devices, "Office display"), "Google Nest Hub");
    assert.equal(matchCastModel(devices, "google tv"), "Smart TV");
    assert.equal(matchCastModel(devices, "Kitchen"), null);
  });

  it("insets a television receiver and leaves a smart display full frame", () => {
    assert.equal(castModelNeedsOverscan("Chromecast"), true);
    assert.equal(castModelNeedsOverscan("Chromecast Ultra"), true);
    assert.equal(castModelNeedsOverscan("Chromecast Google TV"), true);
    assert.equal(castModelNeedsOverscan("Google TV Streamer"), true);
    assert.equal(castModelNeedsOverscan("Smart TV"), true);
    assert.equal(castModelNeedsOverscan("Google Nest Hub"), false);
    assert.equal(castModelNeedsOverscan("Google Nest Hub Max"), false);
    assert.equal(castModelNeedsOverscan("Chromecast Audio"), false);
    assert.equal(castModelNeedsOverscan("Google Home Mini"), false);
    assert.equal(castModelNeedsOverscan("Google Cast Group"), false);
    assert.equal(castModelNeedsOverscan(""), false);
    assert.equal(chooseCastOverscan("Google Nest Hub", true), false);
    assert.equal(chooseCastOverscan("Chromecast", false), true);
    assert.equal(chooseCastOverscan(null, true), true);
    assert.equal(chooseCastOverscan(null, false), false);
  });
});

function txtResponse(records: string[][]): Buffer {
  const bodies = records.map((fields, index) => {
    const name = encodeDnsName(`Device-${index}._googlecast._tcp.local`);
    const text = Buffer.concat(
      fields.map((field) => Buffer.concat([Buffer.from([Buffer.byteLength(field)]), Buffer.from(field)])),
    );
    const header = Buffer.alloc(10);
    header.writeUInt16BE(16, 0);
    header.writeUInt16BE(1, 2);
    header.writeUInt16BE(text.length, 8);
    return Buffer.concat([name, header, text]);
  });
  const header = Buffer.alloc(12);
  header.writeUInt16BE(records.length, 6);
  return Buffer.concat([header, ...bodies]);
}
