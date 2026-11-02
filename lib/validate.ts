import type {
  CameraCredentials,
  CameraDraft,
  CameraPatch,
  PresetAction,
  PtzCommand,
} from "@/lib/types";

export type ParseSuccess<T> = { ok: true; value: T };
export type ParseFailure = { ok: false; error: string };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

const HOST_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;

const PTZ_COMMANDS = new Set<PtzCommand>(["up", "down", "left", "right"]);
const CAMERA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(
  value: unknown,
  field: string,
  options?: { trim?: boolean; max?: number },
): ParseResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} is required.` };
  }
  const text = options?.trim ? value.trim() : value;
  const max = options?.max ?? 128;
  if (text.trim() === "") {
    return { ok: false, error: `${field} is required.` };
  }
  if (text.length > max || /[\u0000-\u001F\u007F]/.test(text)) {
    return { ok: false, error: `${field} is invalid.` };
  }
  return { ok: true, value: text };
}

function readHost(value: unknown): ParseResult<string> {
  const ip = readText(value, "ip", { trim: true });
  if (!ip.ok) return ip;
  if (!HOST_PATTERN.test(ip.value)) {
    return {
      ok: false,
      error: "ip must be an IPv4 address or hostname, without a port.",
    };
  }
  return ip;
}

export function parseCredentials(body: unknown): ParseResult<CameraCredentials> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const ip = readHost(body.ip);
  if (!ip.ok) return ip;

  const username = readText(body.username, "username", { trim: true });
  if (!username.ok) return username;
  const password = readText(body.password, "password");
  if (!password.ok) return password;

  return {
    ok: true,
    value: {
      ip: ip.value,
      username: username.value,
      password: password.value,
    },
  };
}

export function parsePtzCommand(
  body: unknown,
): ParseResult<CameraCredentials & { command: PtzCommand }> {
  const credentials = parseCredentials(body);
  if (!credentials.ok) return credentials;
  if (!isRecord(body) || typeof body.command !== "string") {
    return { ok: false, error: "command is required." };
  }
  if (!PTZ_COMMANDS.has(body.command as PtzCommand)) {
    return {
      ok: false,
      error: "command must be one of: up, down, left, right.",
    };
  }
  return {
    ok: true,
    value: { ...credentials.value, command: body.command as PtzCommand },
  };
}

export function parsePresetRequest(
  body: unknown,
): ParseResult<
  CameraCredentials & { action: PresetAction; presetToken?: string }
> {
  const credentials = parseCredentials(body);
  if (!credentials.ok) return credentials;
  if (!isRecord(body) || (body.action !== "list" && body.action !== "goto")) {
    return { ok: false, error: "action must be list or goto." };
  }
  if (body.action === "list") {
    return { ok: true, value: { ...credentials.value, action: "list" } };
  }

  const presetToken = readText(body.presetToken, "presetToken");
  if (!presetToken.ok) return presetToken;
  return {
    ok: true,
    value: {
      ...credentials.value,
      action: "goto",
      presetToken: presetToken.value,
    },
  };
}

export function parseCameraId(id: string): ParseResult<string> {
  if (!CAMERA_ID.test(id)) return { ok: false, error: "Camera id is invalid." };
  return { ok: true, value: id };
}

export function parseCameraCreate(body: unknown): ParseResult<CameraDraft> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const name = readText(body.name, "name", { trim: true, max: 64 });
  if (!name.ok) return name;
  const credentials = parseCredentials(body);
  if (!credentials.ok) return credentials;
  return { ok: true, value: { name: name.value, ...credentials.value } };
}

export function parseCameraPatch(body: unknown): ParseResult<CameraPatch> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const patch: CameraPatch = {};
  if ("name" in body) {
    const name = readText(body.name, "name", { trim: true, max: 64 });
    if (!name.ok) return name;
    patch.name = name.value;
  }
  if ("ip" in body) {
    const ip = readHost(body.ip);
    if (!ip.ok) return ip;
    patch.ip = ip.value;
  }
  if ("username" in body) {
    const username = readText(body.username, "username", { trim: true });
    if (!username.ok) return username;
    patch.username = username.value;
  }
  if ("password" in body && body.password !== "") {
    const password = readText(body.password, "password");
    if (!password.ok) return password;
    patch.password = password.value;
  }
  if (!patch.name && !patch.ip && !patch.username && !patch.password) {
    return { ok: false, error: "Nothing to update." };
  }
  return { ok: true, value: patch };
}

export function parseCommand(body: unknown): ParseResult<PtzCommand> {
  if (!isRecord(body) || typeof body.command !== "string") {
    return { ok: false, error: "command is required." };
  }
  if (!PTZ_COMMANDS.has(body.command as PtzCommand)) {
    return {
      ok: false,
      error: "command must be one of: up, down, left, right.",
    };
  }
  return { ok: true, value: body.command as PtzCommand };
}

export function parsePresetAction(
  body: unknown,
): ParseResult<{ action: PresetAction; presetToken?: string }> {
  if (!isRecord(body) || (body.action !== "list" && body.action !== "goto")) {
    return { ok: false, error: "action must be list or goto." };
  }
  if (body.action === "list") return { ok: true, value: { action: "list" } };
  const presetToken = readText(body.presetToken, "presetToken");
  if (!presetToken.ok) return presetToken;
  return {
    ok: true,
    value: { action: "goto", presetToken: presetToken.value },
  };
}
