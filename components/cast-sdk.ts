type CastDevice = { friendlyName: string };

type CastSession = {
  getCastDevice(): CastDevice;
  getActiveInputState?(): number;
  loadMedia(request: object): Promise<unknown>;
  endSession(stopCasting: boolean): void;
};

type SessionListener = (event: { sessionState: string }) => void;

type CastContext = {
  setOptions(options: object): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
  addEventListener(type: string, listener: SessionListener): void;
  removeEventListener(type: string, listener: SessionListener): void;
};

type MediaInfo = {
  streamType: string;
  metadata: object;
  hlsSegmentFormat?: string;
  hlsVideoSegmentFormat?: string;
};

type ChromeCast = {
  media: {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    MediaInfo: new (url: string, contentType: string) => MediaInfo;
    LoadRequest: new (media: MediaInfo) => { currentTime?: number };
    StreamType: { LIVE: string };
    GenericMediaMetadata: new () => { title: string };
    HlsSegmentFormat?: { TS: string };
    HlsVideoSegmentFormat?: { MPEG2_TS: string };
  };
  AutoJoinPolicy: { ORIGIN_SCOPED: string };
};

type CastFramework = {
  CastContext: { getInstance(): CastContext };
  CastContextEventType: { SESSION_STATE_CHANGED: string };
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    chrome?: { cast?: ChromeCast };
    cast?: { framework?: CastFramework };
  }
}

let sdkPromise: Promise<boolean> | null = null;
let configured = false;

// Chrome only exposes Cast on a secure page. The installed app opens from this
// computer's LAN name, which is not a secure page, so the Cast API is missing there.
export function castBrowserReady(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(window.chrome) &&
    "presentation" in navigator
  );
}

export function loadCastSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.cast?.framework && window.chrome?.cast) return Promise.resolve(true);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 8000);
      window.__onGCastApiAvailable = (available: boolean) => {
        window.clearTimeout(timeout);
        resolve(available && Boolean(window.cast?.framework && window.chrome?.cast));
      };
      const script = document.createElement("script");
      script.src =
        "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

export function castContext(): CastContext {
  const framework = window.cast?.framework;
  const chromeCast = window.chrome?.cast;
  if (!framework || !chromeCast) throw new Error("Cast is unavailable in this browser.");
  const context = framework.CastContext.getInstance();
  if (!configured) {
    context.setOptions({
      receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
      resumeSavedSession: true,
    });
    configured = true;
  }
  return context;
}

export function sessionEventType(): string {
  const framework = window.cast?.framework;
  if (!framework) throw new Error("Cast is unavailable in this browser.");
  return framework.CastContextEventType.SESSION_STATE_CHANGED;
}

const CONNECTED_CAST_STATES = new Set(["SESSION_STARTED", "SESSION_RESUMED"]);
const CLOSED_CAST_STATES = new Set([
  "SESSION_ENDING",
  "SESSION_ENDED",
  "SESSION_START_FAILED",
  "NO_SESSION",
]);

export function castSessionPhase(state: string): "starting" | "connected" | "closed" | null {
  if (state === "SESSION_STARTING") return "starting";
  if (CONNECTED_CAST_STATES.has(state)) return "connected";
  if (CLOSED_CAST_STATES.has(state)) return "closed";
  return null;
}

export function castDeviceName(): string | null {
  return castContext().getCurrentSession()?.getCastDevice().friendlyName ?? null;
}

// YES and NO mean the receiver is an HDMI source. UNKNOWN is a Nest Hub,
// or a television that did not report the HDMI input.
export function castHdmiActive(): boolean {
  const state = castContext().getCurrentSession()?.getActiveInputState?.();
  return state === 0 || state === 1;
}

export async function requestCastSession(): Promise<void> {
  await castContext().requestSession();
}

export function endCastSession(): void {
  castContext().getCurrentSession()?.endSession(true);
}

export async function loadCastMedia(
  hlsUrl: string,
  title: string,
  startAt: number,
): Promise<void> {
  const chromeCast = window.chrome?.cast;
  const session = castContext().getCurrentSession();
  if (!chromeCast || !session) throw new Error("The Nest display disconnected.");
  const media = new chromeCast.media.MediaInfo(hlsUrl, "application/x-mpegurl");
  media.streamType = chromeCast.media.StreamType.LIVE;
  if (chromeCast.media.HlsSegmentFormat) {
    media.hlsSegmentFormat = chromeCast.media.HlsSegmentFormat.TS;
  }
  if (chromeCast.media.HlsVideoSegmentFormat) {
    media.hlsVideoSegmentFormat = chromeCast.media.HlsVideoSegmentFormat.MPEG2_TS;
  }
  const metadata = new chromeCast.media.GenericMediaMetadata();
  metadata.title = title;
  media.metadata = metadata;
  const request = new chromeCast.media.LoadRequest(media);
  request.currentTime = startAt;
  let timer: number | undefined;
  try {
    await Promise.race([
      session.loadMedia(request),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error("The Nest display did not start the video. Cast again."));
        }, 20_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export function castFailure(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code === "cancel") return null;
    if (code === "receiver_unavailable" || code === "timeout") {
      return "No Nest display responded. Keep this computer and the display on the same Wi-Fi.";
    }
    if ("description" in error && typeof (error as { description: unknown }).description === "string") {
      const description = (error as { description: string }).description.trim();
      if (description) return description;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not start casting.";
}
