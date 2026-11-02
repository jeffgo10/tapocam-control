"use client";

import { StreamPlayer } from "@/components/stream-player";
import type { SavedCamera } from "@/lib/types";
import type { ViewMode } from "@/lib/view";

type StreamState = {
  url: string | null;
  error: string | null;
};

type CameraStageProps = {
  mode: ViewMode;
  cameras: SavedCamera[];
  visibleIds: string[];
  activeId: string | null;
  streams: Record<string, StreamState | undefined>;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  castDevice?: string | null;
};

export function CameraStage({
  mode,
  cameras,
  visibleIds,
  activeId,
  streams,
  onSelect,
  onRetry,
  castDevice = null,
}: CameraStageProps) {
  const visible = visibleIds.flatMap((id) => {
    const camera = cameras.find((item) => item.id === id);
    return camera ? [camera] : [];
  });

  if (visible.length === 0) {
    return (
      <section className="grid aspect-video place-items-center rounded-3xl border border-line bg-black px-6 text-center text-sm text-muted">
        {mode === "wall"
          ? "Check up to four cameras to show them together."
          : "Save a camera, then select it to open the live view."}
      </section>
    );
  }

  return (
    <div
      className={`grid gap-3 ${visible.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}
    >
      {visible.map((camera) => {
        const stream = streams[camera.id];
        return (
          <StreamPlayer
            key={camera.id}
            src={stream?.url ?? null}
            title={camera.name}
            detail={camera.ip}
            emptyLabel="Opening the stream…"
            error={stream?.error}
            selected={mode === "wall" && camera.id === activeId}
            onSelect={mode === "wall" ? () => onSelect(camera.id) : undefined}
            onRetry={() => onRetry(camera.id)}
            castDevice={castDevice}
          />
        );
      })}
    </div>
  );
}
