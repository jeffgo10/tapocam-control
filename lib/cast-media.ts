const IPV4 =
  /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOSTNAME =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const VIRTUAL_INTERFACE =
  /^(?:lo|docker|br-|veth|vmnet|utun|awdl|llw|bridge|vbox|gif|stf|ap|pktap)/;
const CAMERA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const CAM_PATH =
  /^(?:cam|sub)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_PATH =
  /^(?:cast-display|cam-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const RTSP_BASE = /^rtsp:\/\/[a-zA-Z0-9.-]+:\d{2,5}$/;

const TILE =
  "scale=640:360:flags=fast_bilinear:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS,fps=15";
const FRAME =
  "scale=1280:720:flags=fast_bilinear:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS,fps=15";
const SILENT_AUDIO = "anullsrc=channel_layout=stereo:sample_rate=48000,asetpts=PTS-STARTPTS[a]";

export const CAST_PATH = "cast-display";
export const CAST_CONTAINER = "tapocam-cast";
export const FFMPEG_IMAGE = "mwader/static-ffmpeg:7.1";
// The Nest display starts this far behind live. Without a start position it
// plays at the live edge and stalls on every segment.
export const CAST_BUFFER_SECONDS = 8;

export type NetworkAddress = {
  name: string;
  address: string;
  internal: boolean;
  family: string;
};

export type CastEnv = {
  CAST_HOST?: string;
  WEBRTC_ADDITIONAL_HOSTS?: string;
};

export type CastRequest = {
  cameraIds: string[];
  beat: boolean;
};

export type CastStream = {
  hlsUrl: string;
  contentType: "application/x-mpegurl";
  title: string;
  restarted: boolean;
  startAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCastRequest(body: unknown): ParseResult<CastRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  if (!Array.isArray(body.cameraIds)) {
    return { ok: false, error: "cameraIds is required." };
  }
  if (body.cameraIds.length === 0) {
    return { ok: false, error: "Choose a camera to cast." };
  }

  const ids: string[] = [];
  for (const id of body.cameraIds) {
    if (typeof id !== "string" || !CAMERA_ID.test(id)) {
      return { ok: false, error: "Camera id is invalid." };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > 4) {
    return { ok: false, error: "A cast wall can show up to 4 cameras." };
  }
  return { ok: true, value: { cameraIds: ids, beat: body.beat === true } };
}

export function hlsBufferedSeconds(body: string): number {
  let total = 0;
  for (const match of body.matchAll(/#EXTINF:([0-9.]+)/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

// The Nest display stutters on a live playlist that has not started sliding.
export function hlsPlaylistReady(body: string): boolean {
  const sequence = Number(/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(body)?.[1] ?? 0);
  return sequence > 0 && hlsBufferedSeconds(body) >= CAST_BUFFER_SECONDS;
}

// Cast measures a live start position from the oldest segment in the playlist.
export function castStartAt(bufferedSeconds: number): number {
  return Math.max(0, Math.floor(bufferedSeconds - CAST_BUFFER_SECONDS));
}

export function hlsVariantName(body: string): string | null {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const index = lines.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF"));
  if (index < 0) return null;
  const name = lines[index + 1] ?? "";
  if (!name || name.startsWith("#") || name.includes("..") || name.includes("://")) return null;
  // MediaMTX appends its cookie check to the media playlist name.
  if (!/^[A-Za-z0-9._-]+\.m3u8(?:\?[A-Za-z0-9._~%=&-]*)?$/.test(name)) return null;
  return name;
}

export function castTitle(names: string[]): string {
  const title = names.length === 1 ? names[0] : names.join(" · ");
  return title.length > 100 ? `${title.slice(0, 97)}...` : title;
}

export function isCastHost(value: string): boolean {
  const host = value.trim();
  if (LOOPBACK.has(host.toLowerCase())) return false;
  return IPV4.test(host) || HOSTNAME.test(host);
}

export function resolveCastHost(env: CastEnv, interfaces: NetworkAddress[]): string {
  const configured = env.CAST_HOST?.trim();
  if (configured) {
    if (!isCastHost(configured)) {
      throw new Error(
        "CAST_HOST must be this computer's LAN address. A Nest display cannot open localhost.",
      );
    }
    return configured;
  }

  const advertised = (env.WEBRTC_ADDITIONAL_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim())
    .find((item) => item && isCastHost(item));
  if (advertised) return advertised;

  const detected = pickLanAddress(interfaces);
  if (!detected) {
    throw new Error(
      "Set CAST_HOST in .env to this computer's LAN address so the Nest display can reach the stream.",
    );
  }
  return detected;
}

export function hlsPlaylistUrl(host: string, pathName: string, port = "8888"): string {
  if (!isCastHost(host)) {
    throw new Error(
      "CAST_HOST must be this computer's LAN address. A Nest display cannot open localhost.",
    );
  }
  if (!/^\d{2,5}$/.test(port)) throw new Error("HLS port is invalid.");
  if (!PUBLIC_PATH.test(pathName)) throw new Error("Stream path is invalid.");
  return `http://${host}:${port}/${pathName}/index.m3u8`;
}

export function mosaicFilter(count: number): string {
  if (count === 1) return `[0:v]${FRAME}[v]`;
  const tiles = Array.from({ length: count }, (_, index) => `[${index}:v]${TILE}[t${index}]`);
  if (count === 2) {
    return [
      ...tiles,
      "[t0]pad=640:720:0:180:black[a]",
      "[t1]pad=640:720:0:180:black[b]",
      "[a][b]hstack=inputs=2[v]",
    ].join(";");
  }
  if (count === 3) {
    return [
      ...tiles,
      "[t0][t1]hstack=inputs=2[top]",
      "[t2]pad=1280:360:0:0:black[bot]",
      "[top][bot]vstack=inputs=2[v]",
    ].join(";");
  }
  if (count === 4) {
    return [
      ...tiles,
      "[t0][t1][t2][t3]xstack=inputs=4:layout=0_0|640_0|0_360|640_360:fill=black[v]",
    ].join(";");
  }
  throw new Error("A cast needs 1 to 4 cameras.");
}

export function mosaicFfmpegArgs(paths: string[], rtspBase: string): string[] {
  if (!RTSP_BASE.test(rtspBase)) throw new Error("Cast RTSP address is invalid.");
  if (paths.length < 1 || paths.length > 4) {
    throw new Error("A cast needs 1 to 4 cameras.");
  }
  const bitrate = paths.length === 1 ? "1000k" : "1400k";
  const buffer = paths.length === 1 ? "2000k" : "2800k";
  const args = ["-hide_banner", "-loglevel", "warning"];
  for (const path of paths) {
    if (!CAM_PATH.test(path)) throw new Error("Stream path is invalid.");
    args.push(
      "-thread_queue_size",
      "512",
      "-timeout",
      "8000000",
      "-rtsp_transport",
      "tcp",
      "-i",
      `${rtspBase}/${path}`,
    );
  }
  args.push(
    "-filter_complex",
    `${mosaicFilter(paths.length)};${SILENT_AUDIO}`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-profile:v",
    "main",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-bf",
    "0",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    "-b:v",
    bitrate,
    "-maxrate",
    bitrate,
    "-bufsize",
    buffer,
    "-c:a",
    "aac",
    "-b:a",
    "48k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-f",
    "rtsp",
    "-rtsp_transport",
    "tcp",
    `${rtspBase}/${CAST_PATH}`,
  );
  return args;
}

export function mosaicDockerArgs(
  ffmpegArgs: string[],
  options: { image: string; network: string; container: string },
): string[] {
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(options.image)) {
    throw new Error("FFmpeg image is invalid.");
  }
  if (!/^(?:container:)?[a-zA-Z0-9_-]+$/.test(options.network)) {
    throw new Error("Docker network is invalid.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(options.container)) {
    throw new Error("Container name is invalid.");
  }
  return [
    "run",
    "--rm",
    "--init",
    "--name",
    options.container,
    "--network",
    options.network,
    options.image,
    ...ffmpegArgs,
  ];
}

function pickLanAddress(interfaces: NetworkAddress[]): string | null {
  const candidates = interfaces
    .filter((entry) => !entry.internal && isIpv4(entry.family) && isPrivateIpv4(entry.address))
    .filter((entry) => !VIRTUAL_INTERFACE.test(entry.name))
    .map((entry) => ({ address: entry.address, rank: rankAddress(entry) }))
    .sort((left, right) => left.rank - right.rank);
  return candidates[0]?.address ?? null;
}

function rankAddress(entry: NetworkAddress): number {
  if (/^en\d/.test(entry.name) && entry.address.startsWith("192.168.")) return 0;
  if (/^en\d/.test(entry.name) && entry.address.startsWith("10.")) return 1;
  if (/^eth\d/.test(entry.name)) return 2;
  if (entry.address.startsWith("192.168.")) return 3;
  if (entry.address.startsWith("10.")) return 4;
  return 5;
}

function isIpv4(family: string): boolean {
  return family === "IPv4" || family === "4";
}

function isPrivateIpv4(address: string): boolean {
  if (!IPV4.test(address) || address.startsWith("127.") || address.startsWith("169.254.")) {
    return false;
  }
  if (address.startsWith("10.") || address.startsWith("192.168.")) return true;
  const [first, second] = address.split(".");
  return first === "172" && Number(second) >= 16 && Number(second) <= 31;
}
