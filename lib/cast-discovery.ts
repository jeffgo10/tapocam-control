import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";

const PTR = 12;
const TXT = 16;
const MDNS_GROUP = "224.0.0.251";
const MDNS_PORT = 5353;

export type CastAdvertisement = {
  name: string;
  model: string;
};

export function encodeDnsName(name: string): Buffer {
  const labels = name.split(".").filter((label) => label.length > 0);
  const parts: Buffer[] = [];
  for (const label of labels) {
    const text = Buffer.from(label);
    if (text.length > 63) throw new Error("DNS label is too long.");
    parts.push(Buffer.from([text.length]), text);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

export function castQueryPacket(unicastResponse = false): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  const question = Buffer.alloc(4);
  question.writeUInt16BE(PTR, 0);
  question.writeUInt16BE(unicastResponse ? 0x8001 : 1, 2);
  return Buffer.concat([header, encodeDnsName("_googlecast._tcp.local"), question]);
}

export function castAdvertisements(packet: Buffer): CastAdvertisement[] {
  const found: CastAdvertisement[] = [];
  for (const record of dnsRecords(packet)) {
    if (record.type !== TXT) continue;
    if (!record.name.toLowerCase().includes("_googlecast._tcp")) continue;
    const fields = txtFields(record.data);
    const name = fields.fn?.trim() ?? "";
    const model = fields.md?.trim() ?? "";
    if (name && model) found.push({ name, model });
  }
  return found;
}

export function matchCastModel(devices: CastAdvertisement[], friendlyName: string): string | null {
  const wanted = friendlyName.trim().toLowerCase();
  if (!wanted) return null;
  return devices.find((device) => device.name.trim().toLowerCase() === wanted)?.model ?? null;
}

export async function findCastModel(friendlyName: string): Promise<string | null> {
  const name = friendlyName.trim();
  if (!name) return null;
  try {
    const devices = await discoverCastAdvertisements(1000, name);
    return matchCastModel(devices, name);
  } catch {
    return null;
  }
}

export function discoverCastAdvertisements(
  timeoutMs = 1000,
  friendlyName = "",
): Promise<CastAdvertisement[]> {
  return new Promise((resolve) => {
    const socket = openSocket();
    if (!socket) {
      resolve([]);
      return;
    }
    const found = new Map<string, CastAdvertisement>();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // The socket was never bound.
      }
      resolve([...found.values()]);
    };

    const take = (message: Buffer) => {
      for (const device of castAdvertisements(message)) {
        found.set(device.name.toLowerCase(), device);
      }
      if (friendlyName && matchCastModel([...found.values()], friendlyName)) finish();
    };

    const listen = () => {
      socket.removeAllListeners("error");
      socket.on("error", () => finish());
      socket.on("message", take);
      const addresses = lanAddresses();
      if (addresses.length === 0) {
        try {
          socket.addMembership(MDNS_GROUP);
        } catch {
          // A unicast reply can still arrive at the port this query uses.
        }
      }
      for (const address of addresses) {
        try {
          socket.addMembership(MDNS_GROUP, address);
        } catch {
          // This interface does not accept the Cast discovery group.
        }
      }
      try {
        socket.setMulticastTTL(255);
      } catch {
        // Membership can fail on an interface that does not support multicast.
      }
      socket.send(castQueryPacket(false), MDNS_PORT, MDNS_GROUP);
      socket.send(castQueryPacket(true), MDNS_PORT, MDNS_GROUP);
    };

    const timer = setTimeout(finish, timeoutMs);
    socket.once("error", () => {
      try {
        socket.bind(0, listen);
      } catch {
        finish();
      }
    });
    try {
      socket.bind(MDNS_PORT, listen);
    } catch {
      finish();
    }
  });
}

function openSocket(): Socket | null {
  try {
    return createSocket({ type: "udp4", reuseAddr: true });
  } catch {
    return null;
  }
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = String(entry.family);
      if (!entry.internal && (family === "IPv4" || family === "4")) addresses.push(entry.address);
    }
  }
  return addresses;
}

type DnsRecord = {
  name: string;
  type: number;
  data: Buffer;
};

function dnsRecords(packet: Buffer): DnsRecord[] {
  if (packet.length < 12) return [];
  const questions = packet.readUInt16BE(4);
  const total = packet.readUInt16BE(6) + packet.readUInt16BE(8) + packet.readUInt16BE(10);
  let offset = 12;
  for (let index = 0; index < questions; index += 1) {
    offset = decodeDnsName(packet, offset).offset + 4;
    if (offset > packet.length) return [];
  }
  const records: DnsRecord[] = [];
  for (let index = 0; index < total; index += 1) {
    if (offset >= packet.length) break;
    const decoded = decodeDnsName(packet, offset);
    offset = decoded.offset;
    if (offset + 10 > packet.length) break;
    const type = packet.readUInt16BE(offset);
    const length = packet.readUInt16BE(offset + 8);
    const start = offset + 10;
    const end = start + length;
    if (end > packet.length) break;
    records.push({ name: decoded.name, type, data: packet.subarray(start, end) });
    offset = end;
  }
  return records;
}

function decodeDnsName(packet: Buffer, offset: number): { name: string; offset: number } {
  const labels: string[] = [];
  let cursor = offset;
  let end = offset;
  let jumped = false;
  for (let hops = 0; hops < 16 && cursor < packet.length; hops += 1) {
    const length = packet[cursor] ?? 0;
    if (length === 0) {
      if (!jumped) end = cursor + 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= packet.length) break;
      if (!jumped) end = cursor + 2;
      jumped = true;
      cursor = ((length & 0x3f) << 8) | (packet[cursor + 1] ?? 0);
      continue;
    }
    const start = cursor + 1;
    const next = start + length;
    if (next > packet.length) break;
    labels.push(packet.subarray(start, next).toString("utf8"));
    cursor = next;
    if (!jumped) end = cursor;
  }
  return { name: labels.join("."), offset: end };
}

function txtFields(data: Buffer): Record<string, string> {
  const fields: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const length = data[offset] ?? 0;
    const start = offset + 1;
    const end = start + length;
    if (end > data.length) break;
    const entry = data.subarray(start, end).toString("utf8");
    const split = entry.indexOf("=");
    if (split > 0) fields[entry.slice(0, split)] = entry.slice(split + 1);
    offset = end;
  }
  return fields;
}
