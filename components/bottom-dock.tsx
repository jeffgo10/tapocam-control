"use client";

import { useState } from "react";
import { PluginCatalog, PluginSettings, usePlugins } from "@/components/plugin-manager";
import { PresetList } from "@/components/preset-list";
import type { Preset } from "@/lib/types";

type BottomDockProps = {
  presets: Preset[];
  presetsDisabled: boolean;
  busyToken: string | null;
  onGoto: (token: string) => void;
  onPlayback: (camera: { id: string; name: string }) => void;
};

export function BottomDock({ presets, presetsDisabled, busyToken, onGoto, onPlayback }: BottomDockProps) {
  const { plugins, loaded, busy, error, run } = usePlugins();
  const [tab, setTab] = useState("presets");
  const active = plugins.filter((plugin) => plugin.active);
  const selected =
    tab !== "presets" && tab !== "plugins" && !active.some((plugin) => plugin.id === tab)
      ? "plugins"
      : tab;
  const current = active.find((plugin) => plugin.id === selected) ?? null;

  async function onRun(key: string, body: Record<string, unknown>) {
    const next = await run(key, body);
    if (next && body.action === "activate" && typeof body.id === "string") setTab(body.id);
  }

  return (
    <section className="flex min-h-full flex-col rounded-3xl border border-line bg-panel">
      <div className="max-h-72 flex-1 overflow-y-auto p-4">
          {selected === "presets" ? (
            <PresetList
              presets={presets}
              disabled={presetsDisabled}
              busyToken={busyToken}
              onGoto={onGoto}
            />
          ) : null}
          {selected === "plugins" ? (
            <PluginCatalog
              plugins={plugins}
              loaded={loaded}
              busy={busy}
              error={error}
              onRun={(key, body) => {
                void onRun(key, body);
              }}
            />
          ) : null}
          {current ? (
            <PluginSettings
              plugin={current}
              busy={busy}
              error={error}
              onRun={(key, body) => {
                void onRun(key, body);
              }}
              onPlayback={onPlayback}
            />
          ) : null}
      </div>
      <div
        role="tablist"
        aria-label="Bottom panels"
        className="flex gap-1 overflow-x-auto border-t border-line px-2"
      >
          <TabButton selected={selected === "presets"} onSelect={() => setTab("presets")}>
            Presets
          </TabButton>
          {active.map((plugin) => (
            <TabButton
              key={plugin.id}
              selected={selected === plugin.id}
              onSelect={() => setTab(plugin.id)}
            >
              {plugin.name}
            </TabButton>
          ))}
          <TabButton selected={selected === "plugins"} onSelect={() => setTab("plugins")}>
            Plugins
          </TabButton>
        </div>
    </section>
  );
}

function TabButton({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${
        selected ? "border-accent text-accent" : "border-transparent text-muted"
      }`}
    >
      {children}
    </button>
  );
}
