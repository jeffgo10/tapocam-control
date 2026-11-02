"use client";

import { CameraForm } from "@/components/camera-form";
import type { CameraDraft, SavedCamera } from "@/lib/types";
import type { ViewMode } from "@/lib/view";

type CameraLibraryProps = {
  cameras: SavedCamera[];
  loaded: boolean;
  mode: ViewMode;
  activeId: string | null;
  wallIds: string[];
  formMode: "closed" | "new" | string;
  saving: boolean;
  pendingDeleteId: string | null;
  onFormMode: (mode: "closed" | "new" | string) => void;
  onSave: (draft: CameraDraft) => void;
  onControl: (id: string) => void;
  onToggleWall: (id: string) => void;
  onDelete: (id: string) => void;
};

const EMPTY_DRAFT: CameraDraft = { name: "", ip: "", username: "", password: "" };

export function CameraLibrary({
  cameras,
  loaded,
  mode,
  activeId,
  wallIds,
  formMode,
  saving,
  pendingDeleteId,
  onFormMode,
  onSave,
  onControl,
  onToggleWall,
  onDelete,
}: CameraLibraryProps) {
  const editing = cameras.find((camera) => camera.id === formMode) ?? null;
  const showForm = !loaded || formMode !== "closed" || cameras.length === 0;
  const initial: CameraDraft = editing
    ? {
        name: editing.name,
        ip: editing.ip,
        username: editing.username,
        password: "",
      }
    : EMPTY_DRAFT;

  return (
    <section className="rounded-3xl border border-line bg-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Cameras</h2>
        {cameras.length > 0 && formMode === "closed" ? (
          <button
            type="button"
            onClick={() => onFormMode("new")}
            className="rounded-lg px-2 py-1 text-sm text-accent"
          >
            Add
          </button>
        ) : null}
      </div>

      {showForm ? (
        loaded ? (
          <CameraForm
            key={editing?.id ?? "new"}
            initial={initial}
            editing={editing !== null}
            busy={saving}
            onCancel={cameras.length > 0 ? () => onFormMode("closed") : undefined}
            onSubmit={onSave}
          />
        ) : (
          <p className="text-sm text-muted">Loading saved cameras…</p>
        )
      ) : null}

      {cameras.length > 0 ? (
        <ul className={`grid gap-2 ${showForm ? "mt-4" : ""}`}>
          {cameras.map((camera) => {
            const onWall = wallIds.includes(camera.id);
            const controlling = camera.id === activeId;
            return (
              <li
                key={camera.id}
                className={`rounded-2xl border px-3 py-3 ${
                  controlling ? "border-accent" : "border-line"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onControl(camera.id)}
                  className="block w-full text-left"
                >
                  <span className="block text-sm font-medium">{camera.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted">
                    {camera.ip}
                  </span>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={onWall}
                      onChange={() => onToggleWall(camera.id)}
                    />
                    On wall
                  </label>
                  <div className="flex gap-3 text-xs">
                    <button type="button" onClick={() => onFormMode(camera.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => onDelete(camera.id)}
                    >
                      {pendingDeleteId === camera.id ? "Confirm" : "Delete"}
                    </button>
                  </div>
                </div>
                {mode === "single" && controlling ? (
                  <p className="mt-2 text-xs text-accent">Watching</p>
                ) : null}
                {mode === "wall" && controlling && onWall ? (
                  <p className="mt-2 text-xs text-accent">Controls</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-muted">
        Accounts are saved in the MySQL database started with Docker. Check up to
        four cameras for the wall. Pan and tilt follow the highlighted camera.
      </p>
    </section>
  );
}
