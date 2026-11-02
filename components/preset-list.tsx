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
    <section className="rounded-3xl border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">Presets</h2>
      {presets.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {disabled
            ? "Connect to load positions saved on the camera."
            : "This camera has no saved presets."}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
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
    </section>
  );
}
