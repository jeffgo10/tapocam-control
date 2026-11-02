import { streamPathFor } from "@/lib/paths";
import { redactSecrets } from "@/lib/rtsp";

export { streamPathFor };

export const TAPO_PATH = "tapo-main";

function apiBase(): string {
  return (process.env.MEDIAMTX_API_URL ?? "http://127.0.0.1:9997").replace(
    /\/$/,
    "",
  );
}

const PATH_NAME =
  /^(?:tapo-main|cast-display|(?:cam|sub)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function publicStreamUrl(pathName = TAPO_PATH): string {
  assertPathName(pathName);
  const base = (process.env.MEDIAMTX_WEBRTC_URL ?? "http://localhost:8889").replace(
    /\/$/,
    "",
  );
  return `${base}/${pathName}/`;
}

async function apiError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `MediaMTX returned ${response.status}.`;
  try {
    const body = JSON.parse(text) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // The body is not JSON.
  }
  return text.slice(0, 300);
}

export async function ensureRtspSource(rtspUrl: string, pathName: string): Promise<void> {
  assertPathName(pathName);
  const base = apiBase();
  let existing: Response;
  try {
    existing = await fetch(`${base}/v3/config/paths/get/${pathName}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachable(error, base));
  }
  if (existing.ok) {
    const body = (await existing.json()) as { source?: string };
    if (body.source === rtspUrl) return;
  } else if (existing.status !== 404) {
    throw new Error(await apiError(existing));
  }
  await registerRtspSource(rtspUrl, pathName);
}

export async function ensurePublisherPath(pathName: string): Promise<void> {
  assertPathName(pathName);
  const base = apiBase();
  let existing: Response;
  try {
    existing = await fetch(`${base}/v3/config/paths/get/${pathName}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachable(error, base));
  }
  if (existing.ok) {
    const body = (await existing.json()) as { source?: string };
    if (body.source === "publisher") return;
  } else if (existing.status !== 404) {
    throw new Error(await apiError(existing));
  }
  await registerPublisher(pathName);
}

async function registerPublisher(pathName: string): Promise<void> {
  const base = apiBase();
  const pathUrl = `${base}/v3/config/paths`;
  let deleted: Response;
  try {
    deleted = await fetch(`${pathUrl}/delete/${pathName}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachable(error, base));
  }
  if (!deleted.ok && deleted.status !== 404) {
    throw new Error(await apiError(deleted));
  }

  let created: Response;
  try {
    created = await fetch(`${pathUrl}/add/${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ source: "publisher" }),
    });
  } catch (error) {
    throw new Error(bridgeUnreachable(error, base));
  }
  if (!created.ok) throw new Error(await apiError(created));
}

export async function registerRtspSource(
  rtspUrl: string,
  pathName = TAPO_PATH,
): Promise<void> {
  assertPathName(pathName);
  const base = apiBase();
  const pathUrl = `${base}/v3/config/paths`;

  let deleted: Response;
  try {
    deleted = await fetch(`${pathUrl}/delete/${pathName}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachable(error, base));
  }

  if (!deleted.ok && deleted.status !== 404) {
    throw new Error(await apiError(deleted));
  }

  let created: Response;
  try {
    created = await fetch(`${pathUrl}/add/${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        source: rtspUrl,
        sourceOnDemand: true,
        sourceOnDemandStartTimeout: "20s",
        sourceOnDemandCloseAfter: "10s",
        rtspTransport: "tcp",
      }),
    });
  } catch (error) {
    throw new Error(bridgeUnreachable(error, base));
  }

  if (!created.ok) {
    const detail = redactSecrets(await apiError(created), [rtspUrl]);
    throw new Error(detail);
  }
}

export async function removeRtspSource(pathName: string): Promise<void> {
  assertPathName(pathName);
  try {
    await fetch(`${apiBase()}/v3/config/paths/delete/${pathName}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // The camera record can still be removed if the bridge is down.
  }
}

export async function hlsLastRequest(pathName: string): Promise<number | null> {
  assertPathName(pathName);
  try {
    const response = await fetch(`${apiBase()}/v3/hlsmuxers/get/${pathName}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { lastRequest?: string };
    const time = body.lastRequest ? Date.parse(body.lastRequest) : NaN;
    return Number.isFinite(time) ? time : null;
  } catch {
    return null;
  }
}

function assertPathName(pathName: string) {
  if (!PATH_NAME.test(pathName)) throw new Error("Stream path is invalid.");
}

function bridgeUnreachable(error: unknown, base: string): string {
  const reason = error instanceof Error ? error.message : "request failed";
  return `MediaMTX is not reachable at ${base} (${reason}). Start it with docker compose up -d.`;
}
