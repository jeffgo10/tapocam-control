export const WALL_LIMIT = 4;

export type ViewMode = "single" | "wall";

export type ViewPrefs = {
  mode: ViewMode;
  activeId: string | null;
  wallIds: string[];
};

export const EMPTY_VIEW: ViewPrefs = {
  mode: "single",
  activeId: null,
  wallIds: [],
};

export function parseViewPrefs(value: unknown): ViewPrefs {
  if (typeof value !== "object" || value === null) return EMPTY_VIEW;
  const record = value as Record<string, unknown>;
  const wallIds = Array.isArray(record.wallIds)
    ? unique(record.wallIds.filter((id): id is string => typeof id === "string")).slice(
        0,
        WALL_LIMIT,
      )
    : [];
  return {
    mode: record.mode === "wall" ? "wall" : "single",
    activeId: typeof record.activeId === "string" ? record.activeId : null,
    wallIds,
  };
}

export function toggleWall(
  wallIds: string[],
  id: string,
): { wallIds: string[]; error: string | null } {
  if (wallIds.includes(id)) {
    return { wallIds: wallIds.filter((item) => item !== id), error: null };
  }
  if (wallIds.length >= WALL_LIMIT) {
    return { wallIds, error: "A wall can show up to 4 cameras." };
  }
  return { wallIds: [...wallIds, id], error: null };
}

export function visibleCameraIds(prefs: ViewPrefs, cameraIds: string[]): string[] {
  const known = new Set(cameraIds);
  if (prefs.mode === "wall") {
    return prefs.wallIds.filter((id) => known.has(id)).slice(0, WALL_LIMIT);
  }
  const active = activeCameraId(prefs, cameraIds);
  return active ? [active] : [];
}

export function activeCameraId(prefs: ViewPrefs, cameraIds: string[]): string | null {
  if (prefs.mode === "wall") {
    if (prefs.activeId && prefs.wallIds.includes(prefs.activeId) && cameraIds.includes(prefs.activeId)) {
      return prefs.activeId;
    }
    return prefs.wallIds.find((id) => cameraIds.includes(id)) ?? null;
  }
  if (prefs.activeId && cameraIds.includes(prefs.activeId)) return prefs.activeId;
  return cameraIds[0] ?? null;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
