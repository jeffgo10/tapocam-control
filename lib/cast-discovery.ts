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

const SRV = 33;
const A = 1;
const CAST_PORT = 8009;

export type CastEndpoint = {
  name: string;
  model: string;
  address: string;
  port: number;
};

export type CastSighting = {
  texts: Map<string, { name: string; model: string }>;
  services: Map<string, { host: string; port: number }>;
  addresses: Map<string, string>;
};

export function emptyCastSighting(): CastSighting {
  return {
    texts: new Map(),
    services: new Map(),
    addresses: new Map(),
  };
}

// A Cast receiver is only dialed at an address learned from its own advertisement.
export function isCastTarget(address: string): boolean {
  if (/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(address)) {
    const [first, second] = address.split(".").map(Number);
    if (first === 0 || first === 127 || first >= 224) return false;
    if (first === 169 && second === 254) return false;
    return true;
  }
  return (
    address.length > ".local".length &&
    address.length <= 253 &&
    address.endsWith(".local") &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
      address,
    )
  );
}

export function noteCastPacket(sighting: CastSighting, packet: Buffer): void {
  for (const record of dnsRecords(packet)) {
    const key = record.name.toLowerCase();
    if (record.type === TXT && key.includes("_googlecast._tcp")) {
      const fields = txtFields(record.data);
      const name = fields.fn?.trim() ?? "";
      if (!name) continue;
      sighting.texts.set(key, { name, model: fields.md?.trim() ?? "" });
      continue;
    }
    if (record.type === SRV && key.includes("_googlecast._tcp")) {
      if (record.dataOffset + 6 > packet.length) continue;
      const port = packet.readUInt16BE(record.dataOffset + 4);
      const host = decodeDnsName(packet, record.dataOffset + 6).name;
      if (!host || port !== CAST_PORT) continue;
      sighting.services.set(key, { host, port });
      continue;
    }
    if (record.type === A && record.data.length === 4) {
      const address = [...record.data].join(".");
      if (isCastTarget(address)) sighting.addresses.set(key, address);
    }
  }
}

export function castEndpointsFrom(sighting: CastSighting): CastEndpoint[] {
  const found: CastEndpoint[] = [];
  const seen = new Set<string>();
  for (const [instance, text] of sighting.texts) {
    const service = sighting.services.get(instance);
    const host = service?.host ?? "";
    const address =
      (host ? sighting.addresses.get(host.toLowerCase()) : "") ||
      sighting.addresses.get(instance) ||
      (host && isCastTarget(host) ? host : "");
    if (!address || seen.has(text.name.toLowerCase())) continue;
    seen.add(text.name.toLowerCase());
    found.push({
      name: text.name,
      model: text.model,
      address,
      port: CAST_PORT,
    });
  }
  return found;
}

let endpointCache: { at: number; endpoints: CastEndpoint[] } | null = null;

export async function findCastEndpoint(friendlyName: string): Promise<CastEndpoint | null> {
  const wanted = friendlyName.trim().toLowerCase();
  if (!wanted) return null;
  const cached =
    endpointCache && Date.now() - endpointCache.at < 15_000 ? endpointCache.endpoints : null;
  const hit = cached?.find((device) => device.name.toLowerCase() === wanted);
  if (hit) return hit;
  try {
    const endpoints = await discoverCastEndpoints(1200, friendlyName);
    endpointCache = { at: Date.now(), endpoints };
    return endpoints.find((device) => device.name.toLowerCase() === wanted) ?? null;
  } catch {
    return null;
  }
}

export async function listCastDevices(): Promise<{ name: string; model: string }[]> {
  try {
    const endpoints = await discoverCastEndpoints(1200);
    endpointCache = { at: Date.now(), endpoints };
    return endpoints
      .map((device) => ({ name: device.name, model: device.model }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

export function discoverCastAdvertisements(
  timeoutMs = 1000,
  friendlyName = "",
): Promise<CastAdvertisement[]> {
  return collectCastPackets(timeoutMs, (packets) => {
    if (!friendlyName) return false;
    const found = packets.flatMap((packet) => castAdvertisements(packet));
    return matchCastModel(found, friendlyName) !== null;
  }).then((packets) => {
    const found = new Map<string, CastAdvertisement>();
    for (const packet of packets) {
      for (const device of castAdvertisements(packet)) {
        found.set(device.name.toLowerCase(), device);
      }
    }
    return [...found.values()];
  });
}

export function discoverCastEndpoints(
  timeoutMs = 1200,
  friendlyName = "",
): Promise<CastEndpoint[]> {
  const wanted = friendlyName.trim().toLowerCase();
  return collectCastPackets(timeoutMs, (packets) => {
    if (!wanted) return false;
    const sighting = emptyCastSighting();
    for (const packet of packets) noteCastPacket(sighting, packet);
    return castEndpointsFrom(sighting).some((device) => device.name.toLowerCase() === wanted);
  }).then((packets) => {
    const sighting = emptyCastSighting();
    for (const packet of packets) noteCastPacket(sighting, packet);
    return castEndpointsFrom(sighting);
  });
}

function collectCastPackets(
  timeoutMs: number,
  stopEarly: (packets: Buffer[]) => boolean,
): Promise<Buffer[]> {
  return new Promise((resolve) => {
    const socket = openSocket();
    if (!socket) {
      resolve([]);
      return;
    }
    const packets: Buffer[] = [];
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
      resolve(packets);
    };

    const take = (message: Buffer) => {
      packets.push(message);
      if (stopEarly(packets)) finish();
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
  dataOffset: number;
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
    records.push({ name: decoded.name, type, data: packet.subarray(start, end), dataOffset: start });
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
