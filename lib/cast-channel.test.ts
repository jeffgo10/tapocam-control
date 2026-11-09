import assert from "node:assert/strict";
import { createServer, connect, type Server, type Socket } from "node:net";
import { describe, it } from "node:test";
import {
  encodeCastFrame,
  openCastLink,
  readCastPayload,
  takeCastFrames,
  type CastLink,
} from "./cast-channel.ts";

const RECEIVER = "urn:x-cast:com.google.cast.receiver";
const MEDIA = "urn:x-cast:com.google.cast.media";
const HEARTBEAT = "urn:x-cast:com.google.cast.tp.heartbeat";

describe("cast frames", () => {
  it("reads a payload back from a frame", () => {
    const frame = encodeCastFrame(
      "sender-0",
      "receiver-0",
      RECEIVER,
      JSON.stringify({ type: "LAUNCH", requestId: 1 }),
    );
    const taken = takeCastFrames(Buffer.concat([frame, frame.subarray(0, 3)]));
    assert.equal(taken.frames.length, 1);
    assert.equal(taken.rest.length, 3);
    const payload = readCastPayload(taken.frames[0]);
    assert.equal(payload.namespace, RECEIVER);
    assert.equal(JSON.parse(payload.text ?? "{}").type, "LAUNCH");
  });
});

describe("cast link", () => {
  it("launches the default receiver and loads the live playlist", async () => {
    const seen: { type?: string; media?: { contentId?: string; streamType?: string } }[] = [];
    const session = await fakeDisplay((body, reply) => {
      seen.push(body);
      if (body.type === "LAUNCH") {
        reply(RECEIVER, {
          type: "RECEIVER_STATUS",
          requestId: body.requestId,
          status: {
            applications: [
              { appId: "CC1AD845", sessionId: "session-1", transportId: "session-1" },
            ],
          },
        });
      }
      if (body.type === "LOAD") {
        reply(MEDIA, {
          type: "MEDIA_STATUS",
          requestId: body.requestId,
          status: [{ playerState: "BUFFERING" }],
        });
      }
    });
    try {
      await session.link.load({
        url: "http://192.168.1.20:8888/cast-display/index.m3u8",
        title: "Door",
        startAt: 8,
      });
      const load = seen.find((message) => message.type === "LOAD");
      assert.equal(load?.media?.contentId, "http://192.168.1.20:8888/cast-display/index.m3u8");
      assert.equal(load?.media?.streamType, "LIVE");
    } finally {
      await session.close();
    }
  });

  it("answers a heartbeat and reports a rejected load", async () => {
    const seen: { type?: string }[] = [];
    const session = await fakeDisplay((body, reply) => {
      seen.push(body);
      if (body.type === "LAUNCH") {
        reply(RECEIVER, {
          type: "RECEIVER_STATUS",
          status: {
            applications: [
              { appId: "CC1AD845", sessionId: "session-1", transportId: "session-1" },
            ],
          },
        });
      }
      if (body.type === "LOAD") reply(MEDIA, { type: "LOAD_FAILED" });
    });
    try {
      session.device.write(
        encodeCastFrame("receiver-0", "sender-0", HEARTBEAT, JSON.stringify({ type: "PING" })),
      );
      await waitFor(() => seen.some((message) => message.type === "PONG"));
      await assert.rejects(
        session.link.load({ url: "http://192.168.1.20:8888/cast-display/index.m3u8", title: "Door", startAt: 0 }),
        /did not start the video/,
      );
    } finally {
      await session.close();
    }
  });
});

type Reply = (namespace: string, payload: object) => void;

async function fakeDisplay(onMessage: (body: Record<string, unknown>, reply: Reply) => void) {
  let device: Socket | null = null;
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const server: Server = createServer((socket) => {
    device = socket;
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const taken = takeCastFrames(buffer);
      buffer = taken.rest;
      for (const frame of taken.frames) {
        const parsed = readCastPayload(frame);
        const body = JSON.parse(parsed.text ?? "{}") as Record<string, unknown>;
        onMessage(body, (namespace, payload) => {
          socket.write(
            encodeCastFrame("receiver-0", "sender-0", namespace, JSON.stringify(payload)),
          );
        });
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test display did not bind.");
  const client = connect({ host: "127.0.0.1", port: address.port });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", reject);
  });
  const link: CastLink = openCastLink(client);
  return {
    link,
    get device() {
      if (!device) throw new Error("Display socket is missing.");
      return device;
    },
    async close() {
      link.close();
      client.destroy();
      device?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function waitFor(ready: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the display.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
