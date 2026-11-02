"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_VIEW, parseViewPrefs, type ViewPrefs } from "@/lib/view";

const STORAGE_KEY = "tapocam-view";
const listeners = new Set<() => void>();
let snapshot: ViewPrefs = EMPTY_VIEW;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function remember(next: ViewPrefs): ViewPrefs {
  if (
    snapshot.mode === next.mode &&
    snapshot.activeId === next.activeId &&
    snapshot.wallIds.join("\0") === next.wallIds.join("\0")
  ) {
    return snapshot;
  }
  snapshot = next;
  return snapshot;
}

function read(): ViewPrefs {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return remember(EMPTY_VIEW);
  try {
    return remember(parseViewPrefs(JSON.parse(saved) as unknown));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return remember(EMPTY_VIEW);
  }
}

export function writeViewPrefs(next: ViewPrefs) {
  snapshot = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

export function useViewPrefs(): ViewPrefs {
  return useSyncExternalStore(subscribe, read, () => EMPTY_VIEW);
}
