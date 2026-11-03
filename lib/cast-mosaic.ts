import { execFile, spawn, type ChildProcess } from "node:child_process";
import { networkInterfaces } from "node:os";

import {
  CAST_CONTAINER,
  CAST_PATH,
  FFMPEG_IMAGE,
  castLaunchAction,
  castMosaicKey,
  castStartAt,
  castTitle,
  hlsBufferedSeconds,
  hlsPlaylistReady,
  hlsPlaylistUrl,
  hlsVariantName,
  mosaicDockerArgs,
  mosaicFfmpegArgs,
  resolveCastHost,
  type CastStream,
  type NetworkAddress,
} from "@/lib/cast-media";
import {
  ensurePublisherPath,
  ensureRtspSource,
  hlsLastRequest,
  removeRtspSource,
  streamPathFor,
} from "@/lib/mediamtx";
import { castSourcePathFor } from "@/lib/paths";
import { buildRtspUrl } from "@/lib/rtsp";
import type { CameraRecord } from "@/lib/cameras";

const READY_TIMEOUT_MS = 45_000;
// Chrome runs a background tab's heartbeat about once a minute.
const IDLE_MS = 90_000;

type Store = {
  key: string | null;
  child: ChildProcess | null;
  sources: string[];
  lastBeat: number;
  logs: string;
  failure: string | null;
  timer: ReturnType<typeof setInterval> | null;
  chain: Promise<void>;
};

function store(): Store {
  const globalStore = globalThis as typeof globalThis & { __tapocamCast?: Store };
  if (!globalStore.__tapocamCast) {
    globalStore.__tapocamCast = {
      key: null,
      child: null,
      sources: [],
      lastBeat: 0,
      logs: "",
      failure: null,
      timer: null,
      chain: Promise.resolve(),
    };
  }
  return globalStore.__tapocamCast;
}

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const current = store();
  const run = current.chain.then(work, work);
  current.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function lanInterfaces(): NetworkAddress[] {
  const found: NetworkAddress[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      found.push({
        name,
        address: entry.address,
        internal: entry.internal,
        family: String(entry.family),
      });
    }
  }
  return found;
}

function castHost(): string {
  return resolveCastHost(
    {
      CAST_HOST: process.env.CAST_HOST,
      WEBRTC_ADDITIONAL_HOSTS: process.env.WEBRTC_ADDITIONAL_HOSTS,
    },
    lanInterfaces(),
  );
}

function hlsPort(): string {
  return process.env.CAST_HLS_PORT?.trim() || "8888";
}

function rtspBase(): string {
  return (process.env.CAST_RTSP_BASE?.trim() || "rtsp://127.0.0.1:8554").replace(/\/$/, "");
}

function dockerNetwork(): string {
  return process.env.CAST_DOCKER_NETWORK?.trim() || "container:tapocam-mediamtx";
}

export async function prepareCast(
  cameras: CameraRecord[],
  options: { beat: boolean; overscan: boolean },
): Promise<CastStream> {
  const host = castHost();
  const title = castTitle(cameras.map((camera) => camera.name));
  const port = hlsPort();
  const wall = cameras.length > 1;
  if (!options.beat) {
    for (const camera of cameras) {
      const pathName = wall ? castSourcePathFor(camera.id) : streamPathFor(camera.id);
      await ensureRtspSource(buildRtspUrl(camera, wall ? "stream2" : "stream1"), pathName);
    }
  }

  const paths = cameras.map((camera) =>
    wall ? castSourcePathFor(camera.id) : streamPathFor(camera.id),
  );
  const { restarted, buffered } = await startCastMosaic(paths, options.overscan, options.beat);
  return {
    hlsUrl: hlsPlaylistUrl(host, CAST_PATH, port),
    contentType: "application/x-mpegurl",
    title,
    restarted,
    startAt: castStartAt(buffered),
  };
}

export async function startCastMosaic(
  paths: string[],
  overscan = false,
  beat = false,
): Promise<{ restarted: boolean; buffered: number }> {
  const key = castMosaicKey(paths, overscan);
  const restarted = await exclusive(() => launchUnlocked(paths, overscan, beat));
  if (!restarted) {
    const current = store();
    if (current.key !== key) return { restarted: false, buffered: 0 };
  }
  try {
    const buffered = await waitForPlaylist(CAST_PATH, READY_TIMEOUT_MS, key);
    return { restarted, buffered };
  } catch (error) {
    await exclusive(async () => {
      if (store().key === key) await stopUnlocked();
    });
    throw error;
  }
}

export function stopCastMosaic(force = true): Promise<void> {
  return exclusive(async () => {
    if (!force && !store().key && !store().child) return;
    await stopUnlocked();
  });
}

async function launchUnlocked(paths: string[], overscan: boolean, beat: boolean): Promise<boolean> {
  const key = castMosaicKey(paths, overscan);
  const current = store();
  const childAlive = current.child !== null && current.child.exitCode === null;
  const action = castLaunchAction(current.key, childAlive, key, beat);
  if (action === "refresh") {
    current.lastBeat = Date.now();
    return false;
  }
  if (action === "ignore") return false;

  await stopUnlocked();
  store().sources = paths.filter((path) => path.startsWith("sub-"));
  await ensurePublisherPath(CAST_PATH);
  armSweeper();

  const args = mosaicDockerArgs(mosaicFfmpegArgs(paths, rtspBase(), overscan), {
    image: process.env.CAST_FFMPEG_IMAGE?.trim() || FFMPEG_IMAGE,
    network: dockerNetwork(),
    container: CAST_CONTAINER,
  });
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  const started = store();
  started.child = child;
  started.key = key;
  started.logs = "";
  started.failure = null;
  started.lastBeat = Date.now();
  const collect = (chunk: Buffer) => {
    started.logs = (started.logs + chunk.toString("utf8")).slice(-4000);
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  child.once("error", (error: NodeJS.ErrnoException) => {
    started.failure =
      error.code === "ENOENT"
        ? "Docker is required to cast a wall of cameras."
        : error.message;
  });
  return true;
}

async function stopUnlocked(): Promise<void> {
  const current = store();
  current.key = null;
  const child = current.child;
  const sources = current.sources ?? [];
  current.child = null;
  current.sources = [];
  current.logs = "";
  current.failure = null;
  await runDocker(["rm", "-f", CAST_CONTAINER]).catch(() => undefined);
  if (child && child.exitCode === null) child.kill("SIGTERM");
  await removeRtspSource(CAST_PATH);
  for (const source of sources) await removeRtspSource(source);
}

function armSweeper(): void {
  const current = store();
  if (current.timer) clearInterval(current.timer);
  const timer = setInterval(() => {
    const state = store();
    if (!state.key || Date.now() - state.lastBeat < IDLE_MS) return;
    void exclusive(async () => {
      const latest = store();
      if (!latest.key || Date.now() - latest.lastBeat < IDLE_MS) return;
      // The display keeps reading the playlist while it plays.
      const read = await hlsLastRequest(CAST_PATH);
      if (read !== null && Date.now() - read < IDLE_MS) {
        latest.lastBeat = read;
        return;
      }
      await stopUnlocked();
    });
  }, 10_000);
  timer.unref();
  current.timer = timer;
}

async function waitForPlaylist(
  pathName: string,
  timeoutMs = READY_TIMEOUT_MS,
  expectedKey?: string,
): Promise<number> {
  const url = `http://127.0.0.1:${hlsPort()}/${pathName}/index.m3u8`;
  const deadline = Date.now() + timeoutMs;
  let last = "the playlist was not ready";
  while (Date.now() < deadline) {
    store().lastBeat = Date.now();
    if (expectedKey && store().key !== expectedKey) throw new Error("Cast was stopped.");
    const failure = store().failure;
    if (failure) throw new Error(failure);
    const child = store().child;
    if (pathName === CAST_PATH && child && child.exitCode !== null) {
      const detail = store().logs.replace(/\s+/g, " ").trim().slice(-300);
      throw new Error(
        detail
          ? `The cast wall stopped before video was ready. ${detail}`
          : "The cast wall stopped before video was ready.",
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      let text = await response.text();
      const variant = response.ok ? hlsVariantName(text) : null;
      if (variant) {
        const media = await fetch(`${url.slice(0, url.lastIndexOf("/") + 1)}${variant}`, {
          signal: AbortSignal.timeout(2000),
        });
        text = await media.text();
        if (media.ok && hlsPlaylistReady(text)) return hlsBufferedSeconds(text);
      } else if (response.ok && hlsPlaylistReady(text)) {
        return hlsBufferedSeconds(text);
      }
      last = text.replace(/\s+/g, " ").trim().slice(0, 180) || `HTTP ${response.status}`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "request failed";
      last = /ECONNREFUSED|fetch failed/i.test(reason)
        ? "HLS is not reachable. Recreate MediaMTX with docker compose up -d."
        : reason;
    }
    await delay(500);
  }
  throw new Error(`The cast stream did not start. ${last}`);
}

function runDocker(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("docker", args, { timeout: 8_000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
