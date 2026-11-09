import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  castAdvertisements,
  castEndpointsFrom,
  emptyCastSighting,
  encodeDnsName,
  isCastTarget,
  matchCastModel,
  noteCastPacket,
} from "./cast-discovery.ts";
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

  it("joins a Cast name to the address advertised with it", () => {
    const sighting = emptyCastSighting();
    noteCastPacket(sighting, receiverPacket());
    assert.deepEqual(castEndpointsFrom(sighting), [
      {
        name: "Office",
        model: "Google Nest Hub",
        address: "192.168.1.20",
        port: 8009,
      },
    ]);
    noteCastPacket(sighting, loopbackPacket());
    assert.equal(castEndpointsFrom(sighting).some((device) => device.address === "127.0.0.1"), false);
    assert.equal(isCastTarget("192.168.1.20"), true);
    assert.equal(isCastTarget("127.0.0.1"), false);
    assert.equal(isCastTarget("169.254.1.1"), false);
    assert.equal(isCastTarget("nest.local"), true);
    assert.equal(isCastTarget("evil.example"), false);
  });
});

function receiverPacket(): Buffer {
  const host = encodeDnsName("nest.local");
  const address = Buffer.from([192, 168, 1, 20]);
  const aHeader = recordHeader(1, address.length);
  const instance = encodeDnsName("Hub._googlecast._tcp.local");
  const srvBody = Buffer.concat([Buffer.alloc(6), Buffer.from([0xc0, 0x0c])]);
  srvBody.writeUInt16BE(8009, 4);
  const text = txt(["fn=Office", "md=Google Nest Hub"]);
  const body = Buffer.concat([
    host,
    aHeader,
    address,
    instance,
    recordHeader(33, srvBody.length),
    srvBody,
    instance,
    recordHeader(16, text.length),
    text,
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(3, 6);
  return Buffer.concat([header, body]);
}

function loopbackPacket(): Buffer {
  const instance = encodeDnsName("Loop._googlecast._tcp.local");
  const text = txt(["fn=Loopback", "md=Google Nest Hub"]);
  const address = Buffer.from([127, 0, 0, 1]);
  const body = Buffer.concat([
    instance,
    recordHeader(16, text.length),
    text,
    instance,
    recordHeader(1, address.length),
    address,
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(2, 6);
  return Buffer.concat([header, body]);
}

function recordHeader(type: number, length: number): Buffer {
  const header = Buffer.alloc(10);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(1, 2);
  header.writeUInt16BE(length, 8);
  return header;
}

function txt(fields: string[]): Buffer {
  return Buffer.concat(
    fields.map((field) => Buffer.concat([Buffer.from([Buffer.byteLength(field)]), Buffer.from(field)])),
  );
}

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
