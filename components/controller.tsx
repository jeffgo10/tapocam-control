"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/components/api";
import { CameraLibrary } from "@/components/camera-library";
import { CastControl } from "@/components/cast-control";
import { CameraStage } from "@/components/camera-stage";
import { PresetList } from "@/components/preset-list";
import { PtzPad } from "@/components/ptz-pad";
import { useViewPrefs, writeViewPrefs } from "@/components/view-prefs";
import type {
  CameraDraft,
  CameraResponse,
  Preset,
  PresetListResponse,
  PtzCommand,
  SavedCamera,
} from "@/lib/types";
import {
  activeCameraId,
  toggleWall,
  visibleCameraIds,
  type ViewMode,
} from "@/lib/view";

type StreamState = {
  url: string | null;
  error: string | null;
  generation: number;
};

export function Controller() {
  const prefs = useViewPrefs();
  const [cameras, setCameras] = useState<SavedCamera[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formMode, setFormMode] = useState<"closed" | "new" | string>("closed");
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [streams, setStreams] = useState<Record<string, StreamState>>({});
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [moving, setMoving] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [castLive, setCastLive] = useState(false);
  const movingRef = useRef(false);

  const cameraIds = cameras.map((camera) => camera.id);
  const activeId = activeCameraId(prefs, cameraIds);
  const visibleIds = visibleCameraIds(prefs, cameraIds);
  const visibleKey = visibleIds.join("|");
  const readyKey = Object.entries(streams)
    .filter(([, stream]) => stream.url !== null && stream.generation === streamGeneration)
    .map(([id]) => id)
    .sort()
    .join("|");
  const controlsReady = activeId !== null && visibleIds.includes(activeId);

  useEffect(() => {
    let cancelled = false;
    void requestJson<{ cameras: SavedCamera[] }>("/api/cameras")
      .then((data) => {
        if (!cancelled) setCameras(data.cameras);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load cameras.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (castLive) return;
    const ids = visibleKey ? visibleKey.split("|") : [];
    const ready = new Set(readyKey ? readyKey.split("|") : []);
    const targets = ids.filter((id) => !ready.has(id));
    if (targets.length === 0) return;

    let cancelled = false;
    void Promise.all(
      targets.map(async (id) => {
        try {
          const result = await requestJson<CameraResponse>(`/api/cameras/${id}/stream`, {
            method: "POST",
            body: "{}",
          });
          return {
            id,
            url: result.streamUrl,
            error: null,
            generation: streamGeneration,
          };
        } catch (streamError) {
          return {
            id,
            url: null,
            error:
              streamError instanceof Error
                ? streamError.message
                : "Could not open the stream.",
            generation: streamGeneration,
          };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setStreams((current) => {
        const next = { ...current };
        for (const result of results) next[result.id] = result;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [castLive, visibleKey, readyKey, streamGeneration]);

  useEffect(() => {
    if (!activeId || !controlsReady) return;
    let cancelled = false;
    void requestJson<PresetListResponse>(`/api/cameras/${activeId}/presets`, {
      method: "POST",
      body: JSON.stringify({ action: "list" }),
    })
      .then((data) => {
        if (!cancelled) setPresets(data.presets);
      })
      .catch((presetError: unknown) => {
        if (cancelled) return;
        setPresets([]);
        setError(
          presetError instanceof Error ? presetError.message : "Could not load presets.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, controlsReady]);

  function setMode(mode: ViewMode) {
    writeViewPrefs({ ...prefs, mode });
  }

  function controlCamera(id: string) {
    setPresets([]);
    setError(null);
    setPendingDeleteId(null);
    writeViewPrefs({ ...prefs, activeId: id });
  }

  function toggleCameraWall(id: string) {
    const known = prefs.wallIds.filter((item) => cameraIds.includes(item));
    const next = toggleWall(known, id);
    if (next.error) {
      setError(next.error);
      return;
    }
    setError(null);
    const nextActive =
      prefs.mode === "wall"
        ? next.wallIds.includes(prefs.activeId ?? "")
          ? prefs.activeId
          : (next.wallIds[0] ?? null)
        : prefs.activeId;
    writeViewPrefs({
      ...prefs,
      wallIds: next.wallIds,
      activeId: nextActive,
    });
  }

  async function saveCamera(draft: CameraDraft) {
    setSaving(true);
    setError(null);
    try {
      if (formMode === "new" || formMode === "closed") {
        const created = await requestJson<{ camera: SavedCamera }>("/api/cameras", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        setCameras((current) => [...current, created.camera]);
        const wall = toggleWall(
          prefs.wallIds.filter((item) => cameraIds.includes(item)),
          created.camera.id,
        );
        writeViewPrefs({
          ...prefs,
          activeId: created.camera.id,
          wallIds: wall.error ? prefs.wallIds : wall.wallIds,
        });
      } else {
        const updated = await requestJson<{ camera: SavedCamera }>(
          `/api/cameras/${formMode}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: draft.name,
              ip: draft.ip,
              username: draft.username,
              ...(draft.password ? { password: draft.password } : {}),
            }),
          },
        );
        setCameras((current) =>
          current.map((camera) =>
            camera.id === updated.camera.id ? updated.camera : camera,
          ),
        );
        setStreams((current) => {
          const next = { ...current };
          delete next[updated.camera.id];
          return next;
        });
        setStreamGeneration((value) => value + 1);
      }
      setFormMode("closed");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the camera.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCamera(id: string) {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      return;
    }
    setError(null);
    try {
      await requestJson(`/api/cameras/${id}`, { method: "DELETE" });
      setCameras((current) => current.filter((camera) => camera.id !== id));
      setStreams((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      writeViewPrefs({
        ...prefs,
        activeId: prefs.activeId === id ? null : prefs.activeId,
        wallIds: prefs.wallIds.filter((item) => item !== id),
      });
      setPendingDeleteId(null);
      if (formMode === id) setFormMode("closed");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete the camera.",
      );
    }
  }

  async function move(command: PtzCommand) {
    if (!activeId || !controlsReady || movingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    setError(null);
    try {
      await requestJson(`/api/cameras/${activeId}/ptz`, {
        method: "POST",
        body: JSON.stringify({ command }),
      });
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "PTZ command failed.");
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  }

  async function goto(presetToken: string) {
    if (!activeId || !controlsReady) return;
    setBusyToken(presetToken);
    setError(null);
    try {
      await requestJson(`/api/cameras/${activeId}/presets`, {
        method: "POST",
        body: JSON.stringify({ action: "goto", presetToken }),
      });
    } catch (gotoError) {
      setError(
        gotoError instanceof Error ? gotoError.message : "Could not move to that preset.",
      );
    } finally {
      setBusyToken(null);
    }
  }

  function retryStream(id: string) {
    setStreams((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setStreamGeneration((value) => value + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">
            Local
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Tapo cameras</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CastControl cameraIds={visibleIds} onLiveChange={setCastLive} />
          <div className="inline-flex rounded-xl border border-line p-1">
            <ModeButton current={prefs.mode} mode="single" onSelect={setMode}>
              Single
            </ModeButton>
            <ModeButton current={prefs.mode} mode="wall" onSelect={setMode}>
              Wall
            </ModeButton>
          </div>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid gap-5">
          <CameraLibrary
            cameras={cameras}
            loaded={loaded}
            mode={prefs.mode}
            activeId={activeId}
            wallIds={prefs.wallIds.filter((id) => cameraIds.includes(id))}
            formMode={formMode}
            saving={saving}
            pendingDeleteId={pendingDeleteId}
            onFormMode={setFormMode}
            onSave={(draft) => {
              void saveCamera(draft);
            }}
            onControl={controlCamera}
            onToggleWall={toggleCameraWall}
            onDelete={(id) => {
              void deleteCamera(id);
            }}
          />
          <PtzPad
            disabled={!controlsReady}
            busy={moving}
            onMove={(command) => {
              void move(command);
            }}
          />
          <PresetList
            presets={controlsReady ? presets : []}
            disabled={!controlsReady}
            busyToken={busyToken}
            onGoto={(token) => {
              void goto(token);
            }}
          />
        </div>
        <CameraStage
          mode={prefs.mode}
          cameras={cameras}
          visibleIds={visibleIds}
          activeId={activeId}
          streams={streams}
          onSelect={controlCamera}
          onRetry={retryStream}
          suspended={castLive}
        />
      </div>
    </div>
  );
}

function ModeButton({
  current,
  mode,
  onSelect,
  children,
}: {
  current: ViewMode;
  mode: ViewMode;
  onSelect: (mode: ViewMode) => void;
  children: string;
}) {
  const selected = current === mode;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(mode)}
      className={`h-9 rounded-lg px-4 text-sm font-medium ${
        selected ? "bg-accent text-accent-ink" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
