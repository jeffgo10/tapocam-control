import { type Duplex } from "node:stream";

const RECEIVER_ID = "receiver-0";
const SENDER_ID = "sender-0";
const CONNECTION = "urn:x-cast:com.google.cast.tp.connection";
const HEARTBEAT = "urn:x-cast:com.google.cast.tp.heartbeat";
const RECEIVER = "urn:x-cast:com.google.cast.receiver";
const MEDIA = "urn:x-cast:com.google.cast.media";
const DEFAULT_RECEIVER = "CC1AD845";

export type CastPlayback = {
  url: string;
  title: string;
  startAt: number;
};

export type CastLink = {
  readonly connected: boolean;
  load(media: CastPlayback): Promise<void>;
  stop(): void;
  close(): void;
};

type CastJson = Record<string, unknown>;

type Waiter = {
  match: (message: CastJson) => boolean;
  resolve: (message: CastJson) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function encodeCastFrame(
  source: string,
  destination: string,
  namespace: string,
  payload: string,
): Buffer {
  const body = Buffer.concat([
    fieldVarint(1, 0),
    fieldBytes(2, Buffer.from(source)),
    fieldBytes(3, Buffer.from(destination)),
    fieldBytes(4, Buffer.from(namespace)),
    fieldVarint(5, 0),
    fieldBytes(6, Buffer.from(payload)),
  ]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function takeCastFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer } {
  const frames: Buffer[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = buffer.readUInt32BE(offset);
    if (length > 1_000_000) throw new Error("Cast message is too large.");
    if (buffer.length - offset - 4 < length) break;
    frames.push(buffer.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  const rest: Buffer<ArrayBufferLike> = offset === 0 ? buffer : buffer.subarray(offset);
  return { frames, rest };
}

export function readCastPayload(frame: Buffer): { namespace: string; text: string | null } {
  let offset = 0;
  let namespace = "";
  let text: string | null = null;
  while (offset < frame.length) {
    const key = readVarint(frame, offset);
    offset = key.offset;
    const field = key.value >>> 3;
    const wire = key.value & 7;
    if (wire === 0) {
      offset = readVarint(frame, offset).offset;
    } else if (wire === 2) {
      const length = readVarint(frame, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > frame.length) break;
      const slice = frame.subarray(offset, end);
      offset = end;
      if (field === 4) namespace = slice.toString("utf8");
      if (field === 6) text = slice.toString("utf8");
    } else if (wire === 5) {
      offset += 4;
    } else if (wire === 1) {
      offset += 8;
    } else {
      break;
    }
  }
  return { namespace, text };
}

export function openCastLink(socket: Duplex): CastLink {
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let closed = false;
  let requestId = 0;
  let sessionId = "";
  let transportId = "";
  const waiters: Waiter[] = [];

  const write = (destination: string, namespace: string, payload: CastJson) => {
    if (!socket.writable) return;
    socket.write(encodeCastFrame(SENDER_ID, destination, namespace, JSON.stringify(payload)));
  };
  const ping = setInterval(() => {
    if (closed || !socket.writable) return;
    write(RECEIVER_ID, HEARTBEAT, { type: "PING" });
  }, 5_000);
  ping.unref();

  const fail = (error: Error) => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    socket.destroy();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    const error = new Error("The Nest display disconnected.");
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    if (socket.writable) socket.end();
    else socket.destroy();
  };

  const waitFor = (match: (message: CastJson) => boolean, timeoutMs: number) =>
    new Promise<CastJson>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("The Nest display did not start the video. Cast again."));
      }, timeoutMs);
      waiters.push({
        match,
        timer,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject,
      });
    });

  const onMessage = (message: CastJson) => {
    if (message.type === "PING") {
      write(RECEIVER_ID, HEARTBEAT, { type: "PONG" });
      return;
    }
    for (const waiter of [...waiters]) {
      if (!waiter.match(message)) continue;
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      waiter.resolve(message);
    }
  };

  socket.on("data", (chunk: Buffer) => {
    try {
      buffer = Buffer.concat([buffer, chunk]);
      const taken = takeCastFrames(buffer);
      buffer = taken.rest;
      for (const frame of taken.frames) {
        const parsed = readCastPayload(frame);
        if (!parsed.text) continue;
        const message = JSON.parse(parsed.text) as unknown;
        if (!message || typeof message !== "object" || Array.isArray(message)) continue;
        onMessage(message as CastJson);
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error("The Nest display disconnected."));
    }
  });
  socket.on("error", () => fail(new Error("The Nest display disconnected.")));
  socket.on("close", () => fail(new Error("The Nest display disconnected.")));

  write(RECEIVER_ID, CONNECTION, { type: "CONNECT", origin: {}, userAgent: "Tapo cameras" });

  return {
    get connected() {
      return !closed && socket.writable;
    },
    async load(media) {
      if (closed || !socket.writable) throw new Error("The Nest display disconnected.");
      if (!sessionId || !transportId) {
        write(RECEIVER_ID, RECEIVER, {
          type: "LAUNCH",
          requestId: ++requestId,
          appId: DEFAULT_RECEIVER,
        });
        const launched = await waitFor((message) => launchedApp(message) !== null, 15_000);
        const app = launchedApp(launched);
        if (!app) throw new Error("The Nest display did not start the video. Cast again.");
        sessionId = app.sessionId;
        transportId = app.transportId;
        write(transportId, CONNECTION, { type: "CONNECT", origin: {}, userAgent: "Tapo cameras" });
      }
      write(transportId, MEDIA, {
        type: "LOAD",
        requestId: ++requestId,
        sessionId,
        autoplay: true,
        currentTime: Math.max(0, Math.floor(media.startAt)),
        media: {
          contentId: media.url,
          contentType: "application/x-mpegurl",
          streamType: "LIVE",
          metadata: { type: 0, metadataType: 0, title: media.title },
          hlsSegmentFormat: "TS",
          hlsVideoSegmentFormat: "MPEG2_TS",
        },
      });
      const result = await waitFor((message) => mediaFailed(message) || mediaStarted(message), 20_000);
      if (mediaFailed(result)) {
        throw new Error("The Nest display did not start the video. Cast again.");
      }
    },
    stop() {
      if (!closed && sessionId) {
        write(RECEIVER_ID, RECEIVER, { type: "STOP", requestId: ++requestId, sessionId });
        write(RECEIVER_ID, CONNECTION, { type: "CLOSE" });
      }
      close();
    },
    close,
  };
}

function launchedApp(message: CastJson): { sessionId: string; transportId: string } | null {
  if (message.type !== "RECEIVER_STATUS") return null;
  const status = message.status;
  if (!status || typeof status !== "object") return null;
  const applications = (status as { applications?: unknown }).applications;
  if (!Array.isArray(applications)) return null;
  for (const application of applications) {
    if (!application || typeof application !== "object") continue;
    const record = application as { appId?: unknown; sessionId?: unknown; transportId?: unknown };
    if (record.appId !== DEFAULT_RECEIVER) continue;
    if (typeof record.sessionId !== "string" || typeof record.transportId !== "string") continue;
    return { sessionId: record.sessionId, transportId: record.transportId };
  }
  return null;
}

function mediaStarted(message: CastJson): boolean {
  if (message.type !== "MEDIA_STATUS" || !Array.isArray(message.status)) return false;
  return message.status.some((item) => {
    if (!item || typeof item !== "object") return false;
    const state = (item as { playerState?: unknown }).playerState;
    return state === "BUFFERING" || state === "PLAYING" || state === "PAUSED";
  });
}

function mediaFailed(message: CastJson): boolean {
  if (message.type === "LOAD_FAILED") return true;
  if (message.type !== "MEDIA_STATUS" || !Array.isArray(message.status)) return false;
  return message.status.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { playerState?: unknown; idleReason?: unknown };
    return record.playerState === "IDLE" && record.idleReason === "ERROR";
  });
}

function fieldVarint(field: number, value: number): Buffer {
  return Buffer.concat([varint((field << 3) | 0), varint(value)]);
}

function fieldBytes(field: number, data: Buffer): Buffer {
  return Buffer.concat([varint((field << 3) | 2), varint(data.length), data]);
}

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value >>> 0;
  while (rest > 127) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

function readVarint(buffer: Buffer, offset: number): { value: number; offset: number } {
  let value = 0;
  let shift = 0;
  while (offset < buffer.length && shift < 35) {
    const byte = buffer[offset] ?? 0;
    offset += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  throw new Error("Cast message is incomplete.");
}
