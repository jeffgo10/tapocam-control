"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/components/api";
import {
  castContext,
  castDeviceName,
  castFailure,
  castHdmiActive,
  castSessionPhase,
  endCastSession,
  loadCastMedia,
  loadCastSdk,
  requestCastSession,
  sessionEventType,
} from "@/components/cast-sdk";

type CastResponse = {
  hlsUrl: string;
  title: string;
  restarted: boolean;
  startAt: number;
  overscan?: boolean;
};

type CastControlProps = {
  cameraIds: string[];
  onLiveChange: (deviceName: string | null) => void;
};

export function CastControl({ cameraIds, onLiveChange }: CastControlProps) {
  const cameraKey = cameraIds.join("|");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live">("idle");
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const publishedKey = useRef<string | null>(null);
  const casting = useRef(false);
  const generation = useRef(0);
  const dismissedRef = useRef(false);
  const round = useRef(0);
  const sessionRound = useRef(0);
  const endingSession = useRef(false);
  const forcedStop = useRef(false);
  const overscanChoice = useRef(false);

  const live = !dismissed && status === "live" && deviceName !== null;
  const connecting = !dismissed && status === "starting";

  function setCastStatus(next: "idle" | "starting" | "live") {
    if (dismissedRef.current && next !== "idle") return;
    setStatus(next);
  }

  function stopServer() {
    void fetch("/api/cast", { method: "DELETE", keepalive: true });
  }

  function endReceiver() {
    if (endingSession.current) return;
    endingSession.current = true;
    try {
      endCastSession();
    } catch {
      // The Cast SDK is not loaded yet.
    } finally {
      endingSession.current = false;
    }
  }

  function markDismissed() {
    dismissedRef.current = true;
    forcedStop.current = false;
    setDismissed(true);
    generation.current += 1;
    publishedKey.current = null;
    casting.current = false;
    setDeviceName(null);
    setStatus("idle");
  }

  function stopRejoin() {
    if (forcedStop.current || endingSession.current) return;
    forcedStop.current = true;
    endingSession.current = true;
    try {
      endCastSession();
    } catch {
      // The Cast SDK is not loaded yet.
    } finally {
      endingSession.current = false;
    }
  }

  useEffect(() => {
    onLiveChange(live ? deviceName : null);
  }, [deviceName, live, onLiveChange]);

  useEffect(() => {
    const onLeave = () => {
      if (!casting.current) return;
      stopServer();
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    void loadCastSdk().then((available) => {
      if (cancelled || !available) return;
      const context = castContext();
      const finishCast = () => {
        if (endingSession.current) return;
        if (round.current !== sessionRound.current) return;
        if (!casting.current) {
          setDeviceName(null);
          setCastStatus("idle");
          return;
        }
        round.current += 1;
        markDismissed();
        setMessage(null);
        stopServer();
      };
      const adoptCast = (name: string | null) => {
        if (!name) {
          if (casting.current) stopServer();
          casting.current = false;
          setDeviceName(null);
          setCastStatus("idle");
          return;
        }
        sessionRound.current = round.current;
        casting.current = true;
        setDeviceName(name);
      };
      const onSession = (event?: { sessionState?: string }) => {
        const state = event?.sessionState;
        const phase = state ? castSessionPhase(state) : null;
        if (phase === "starting") {
          if (dismissedRef.current) stopRejoin();
          return;
        }
        if (dismissedRef.current) {
          setDeviceName(null);
          setCastStatus("idle");
          if (phase === "connected") stopRejoin();
          return;
        }
        // SESSION_ENDING still has a device. Treating that as connected starts
        // another cast and leaves the button on "Connecting…".
        if (phase === "closed") {
          finishCast();
          return;
        }
        if (phase === "connected" || state === undefined) adoptCast(castDeviceName());
      };
      const eventType = sessionEventType();
      context.addEventListener(eventType, onSession);
      detach = () => context.removeEventListener(eventType, onSession);
      onSession();
    });
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  useEffect(() => {
    if (!deviceName || dismissedRef.current) {
      publishedKey.current = null;
      return;
    }
    if (!cameraKey) return;
    const requestId = `${cameraKey}@${attempt}@${deviceName}`;
    if (publishedKey.current === requestId) return;

    const token = ++generation.current;
    const controller = new AbortController();
    void (async () => {
      if (generation.current !== token || dismissedRef.current) return;
      setCastStatus("starting");
      setMessage(null);
      try {
        const prepared = await requestJson<CastResponse>("/api/cast", {
          method: "POST",
          body: JSON.stringify({
            cameraIds: cameraKey.split("|"),
            deviceName,
            hdmi: castHdmiActive(),
          }),
          signal: controller.signal,
        });
        if (generation.current !== token || dismissedRef.current) return;
        overscanChoice.current = prepared.overscan === true;
        await loadCastMedia(prepared.hlsUrl, prepared.title, prepared.startAt);
        if (generation.current !== token || dismissedRef.current) return;
        publishedKey.current = requestId;
        setCastStatus("live");
      } catch (error) {
        if (generation.current !== token || dismissedRef.current) return;
        setCastStatus("idle");
        setMessage(error instanceof Error ? error.message : "Could not start casting.");
      }
    })();
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [attempt, cameraKey, deviceName]);

  useEffect(() => {
    if (dismissed || !deviceName || status !== "live" || !cameraKey) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void requestJson<CastResponse>("/api/cast", {
        method: "POST",
        body: JSON.stringify({
          cameraIds: cameraKey.split("|"),
          beat: true,
          overscan: overscanChoice.current,
        }),
        signal: controller.signal,
      })
        .then((prepared) => {
          if (controller.signal.aborted || !prepared.restarted) return;
          return loadCastMedia(prepared.hlsUrl, prepared.title, prepared.startAt);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setMessage(error instanceof Error ? error.message : "The Nest display lost the stream.");
        });
    }, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [cameraKey, deviceName, dismissed, status]);

  function releaseCast() {
    round.current += 1;
    markDismissed();
    setMessage(null);
    endReceiver();
    stopServer();
  }

  async function toggleCast() {
    const active = !dismissed && (status === "starting" || (deviceName !== null && status === "live"));
    if (active) {
      releaseCast();
      return;
    }
    if (!dismissed && deviceName) {
      setMessage(null);
      setAttempt((value) => value + 1);
      return;
    }

    round.current += 1;
    const epoch = round.current;
    dismissedRef.current = false;
    setDismissed(false);
    setMessage(null);
    setCastStatus("starting");
    try {
      const available = await loadCastSdk();
      if (round.current !== epoch || dismissedRef.current) return;
      if (!available) {
        setCastStatus("idle");
        setMessage("Cast works in desktop Chrome, on the same Wi-Fi as the Nest display.");
        return;
      }
      await requestCastSession();
      if (round.current !== epoch || dismissedRef.current) return;
      const name = castDeviceName();
      sessionRound.current = epoch;
      casting.current = Boolean(name);
      setDeviceName(name);
      if (!name) setCastStatus("idle");
    } catch (error) {
      if (round.current !== epoch || dismissedRef.current) return;
      setCastStatus("idle");
      setMessage(castFailure(error));
    }
  }

  const disabled = cameraIds.length === 0;

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        aria-pressed={live}
        disabled={disabled}
        title={
          connecting
            ? "Cancel this cast."
            : live
              ? "The display plays short pieces of video, a few seconds behind live. Pan, tilt, and presets stay in this browser."
              : "Send the current camera or wall to a Google Nest display."
        }
        onClick={() => {
          void toggleCast();
        }}
        className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
          live ? "border-live/50 text-live" : "border-line text-foreground"
        }`}
      >
        <CastIcon />
        {live
          ? deviceName
          : connecting
            ? "Connecting…"
            : !dismissed && deviceName
              ? "Retry cast"
              : "Cast"}
      </button>
      {message ? <p className="max-w-72 text-right text-xs text-danger">{message}</p> : null}
      {live ? (
        <p className="max-w-72 text-right text-xs text-muted">
          Browser video is paused. Controls stay here.
        </p>
      ) : null}
    </div>
  );
}

function CastIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}
