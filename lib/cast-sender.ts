import { connect as connectTls, type TLSSocket } from "node:tls";

import { openCastLink, type CastLink, type CastPlayback } from "@/lib/cast-channel";
import {
  findCastEndpoint,
  isCastTarget,
  type CastEndpoint,
} from "@/lib/cast-discovery";

type SenderStore = {
  chain: Promise<void>;
  session: { name: string; link: CastLink } | null;
};

function senderStore(): SenderStore {
  const globalStore = globalThis as typeof globalThis & { __tapocamCastSender?: SenderStore };
  if (!globalStore.__tapocamCastSender) {
    globalStore.__tapocamCastSender = { chain: Promise.resolve(), session: null };
  }
  return globalStore.__tapocamCastSender;
}

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const current = senderStore();
  const run = current.chain.then(work, work);
  current.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sameDevice(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function playOnCastDevice(
  deviceName: string,
  media: CastPlayback,
  known: CastEndpoint | null = null,
): Promise<void> {
  return exclusive(async () => {
    const current = senderStore().session;
    if (
      current?.link.connected &&
      (deviceName.trim() === "" || sameDevice(current.name, deviceName))
    ) {
      await current.link.load(media);
      return;
    }
    if (current) {
      senderStore().session = null;
      current.link.stop();
    }

    const endpoint =
      known && sameDevice(known.name, deviceName) ? known : await findCastEndpoint(deviceName);
    if (!endpoint) throw new Error("That Nest display is not on this Wi-Fi anymore.");
    const socket = await connectCast(endpoint.address, endpoint.port);
    const link = openCastLink(socket);
    senderStore().session = { name: endpoint.name, link };
    socket.once("close", () => {
      if (senderStore().session?.link === link) senderStore().session = null;
    });
    try {
      await link.load(media);
    } catch (error) {
      link.close();
      if (senderStore().session?.link === link) senderStore().session = null;
      throw error;
    }
  });
}

export function stopCastDevice(): Promise<void> {
  return exclusive(async () => {
    const current = senderStore().session;
    senderStore().session = null;
    current?.link.stop();
  });
}

function connectCast(address: string, port: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    if (!isCastTarget(address) || port !== 8009) {
      reject(new Error("That Nest display is not on this Wi-Fi anymore."));
      return;
    }
    const socket = connectTls({
      host: address,
      port,
      rejectUnauthorized: false,
      timeout: 8_000,
    });
    const fail = () => {
      socket.destroy();
      reject(new Error("The Nest display did not answer. Keep it on the same Wi-Fi."));
    };
    socket.once("secureConnect", () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("timeout", fail);
    socket.once("error", fail);
  });
}
