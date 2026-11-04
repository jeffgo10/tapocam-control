"use client";

import type { Preset } from "@/lib/types";

type PresetListProps = {
  presets: Preset[];
  disabled: boolean;
  busyToken: string | null;
  onGoto: (token: string) => void;
};

export function PresetList({
  presets,
  disabled,
  busyToken,
  onGoto,
}: PresetListProps) {
  return (
    <div>
      {presets.length === 0 ? (
        <p className="text-sm text-muted">
          {disabled
            ? "Connect to load positions saved on the camera."
            : "This camera has no saved presets."}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {presets.map((preset) => (
            <li key={preset.token}>
              <button
                type="button"
                disabled={disabled || busyToken !== null}
                onClick={() => onGoto(preset.token)}
                className="flex h-11 w-full items-center justify-between rounded-xl border border-line bg-background px-3 text-left text-sm disabled:opacity-50"
              >
                <span>{preset.name}</span>
                <span className="font-mono text-xs text-muted">
                  {busyToken === preset.token ? "Moving" : preset.token}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
