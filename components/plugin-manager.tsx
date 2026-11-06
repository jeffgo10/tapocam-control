"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@/components/api";
import type { PluginListing } from "@/lib/plugin-types";

type PluginResponse = { plugins: PluginListing[] };

export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginListing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await requestJson<PluginResponse>("/api/plugins");
    setPlugins(data.plugins);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void requestJson<PluginResponse>("/api/plugins")
      .then((data) => {
        if (!cancelled) setPlugins(data.plugins);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load plugins.");
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
    if (!plugins.some((plugin) => plugin.active)) return;
    const timer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 15_000);
    return () => clearInterval(timer);
  }, [plugins, refresh]);

  async function run(key: string, pathBody: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const data = await requestJson<PluginResponse>("/api/plugins", {
        method: "POST",
        body: JSON.stringify(pathBody),
      });
      setPlugins(data.plugins);
      return data.plugins;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update the plugin.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { plugins, loaded, busy, error, run };
}

export function PluginCatalog({
  plugins,
  loaded,
  busy,
  error,
  onRun,
}: {
  plugins: PluginListing[];
  loaded: boolean;
  busy: string | null;
  error: string | null;
  onRun: (key: string, body: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Install a plugin into this app, then activate it. Deactivate or uninstall stops what it started.
      </p>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!loaded ? <p className="text-sm text-muted">Loading plugins…</p> : null}
      {loaded && plugins.length === 0 ? (
        <p className="text-sm text-muted">No plugins found next to this app.</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {plugins.map((plugin) => (
          <article key={plugin.id} className="grid gap-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">{plugin.name}</h3>
                <p className="text-sm text-muted">{plugin.description}</p>
              </div>
              <span className="text-xs text-muted">
                {plugin.active ? "Active" : plugin.installed ? "Installed" : "Available"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!plugin.installed ? (
                <ActionButton
                  label="Install"
                  busy={busy === `${plugin.id}:install`}
                  disabled={busy !== null}
                  onClick={() => onRun(`${plugin.id}:install`, { action: "install", id: plugin.id })}
                />
              ) : null}
              {plugin.installed && !plugin.active ? (
                <ActionButton
                  label="Activate"
                  busy={busy === `${plugin.id}:activate`}
                  disabled={busy !== null}
                  onClick={() => onRun(`${plugin.id}:activate`, { action: "activate", id: plugin.id })}
                />
              ) : null}
              {plugin.active ? (
                <ActionButton
                  label="Deactivate"
                  busy={busy === `${plugin.id}:deactivate`}
                  disabled={busy !== null}
                  onClick={() =>
                    onRun(`${plugin.id}:deactivate`, { action: "deactivate", id: plugin.id })
                  }
                />
              ) : null}
              {plugin.installed ? (
                <ActionButton
                  label="Uninstall"
                  busy={busy === `${plugin.id}:uninstall`}
                  disabled={busy !== null}
                  onClick={() =>
                    onRun(`${plugin.id}:uninstall`, { action: "uninstall", id: plugin.id })
                  }
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function PluginSettings({
  plugin,
  busy,
  error,
  onRun,
  onPlayback,
}: {
  plugin: PluginListing;
  busy: string | null;
  error: string | null;
  onRun: (key: string, body: Record<string, unknown>) => void;
  onPlayback?: (camera: { id: string; name: string }) => void;
}) {
  const settings = plugin.settings;
  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {settings ? (
        <div className="grid gap-3">
          <p className="text-sm">{settings.summary}</p>
          {settings.error ? (
            <p role="alert" className="text-sm text-danger">
              {settings.error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {settings.cameras.map((camera) => (
              <div key={camera.id} className="rounded-2xl border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{camera.name}</p>
                    <p className="text-xs text-muted">
                      {camera.ip} · {camera.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {plugin.id === "record" && onPlayback ? (
                      <ActionButton
                        label="Playback"
                        busy={false}
                        disabled={false}
                        onClick={() => onPlayback({ id: camera.id, name: camera.name })}
                      />
                    ) : null}
                    <ActionButton
                      label={cameraToggleLabel(plugin.id, camera.enabled)}
                      busy={busy === `${plugin.id}:${camera.id}`}
                      disabled={busy !== null}
                      onClick={() =>
                        onRun(`${plugin.id}:${camera.id}`, {
                          action: "camera",
                          id: plugin.id,
                          cameraId: camera.id,
                          enabled: !camera.enabled,
                        })
                      }
                    />
                  </div>
                </div>
                {plugin.id === "record" ? (
                  <KeepControl
                    key={`${camera.id}:${camera.keep?.amount ?? 2}:${camera.keep?.unit ?? "weeks"}`}
                    pluginId={plugin.id}
                    cameraId={camera.id}
                    keep={camera.keep ?? { amount: 2, unit: "weeks" }}
                    busy={busy !== null}
                    pending={busy === `${plugin.id}:${camera.id}:keep`}
                    onRun={onRun}
                  />
                ) : null}
                {plugin.id === "preset-carousel" ? (
                  <CarouselControl
                    key={`${camera.id}:${camera.intervalSeconds ?? 60}`}
                    pluginId={plugin.id}
                    cameraId={camera.id}
                    seconds={camera.intervalSeconds ?? 60}
                    presets={camera.presets ?? []}
                    busyId={busy}
                    onRun={onRun}
                  />
                ) : null}
                {camera.files.length > 0 ? (
                  <ul className="mt-2 grid gap-1 text-xs text-muted">
                    {camera.files.map((file) => (
                      <li key={file.name}>
                        {file.name} · {file.size} · {file.modified}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">This plugin has no settings.</p>
      )}
    </div>
  );
}

function KeepControl({
  pluginId,
  cameraId,
  keep,
  busy,
  pending,
  onRun,
}: {
  pluginId: string;
  cameraId: string;
  keep: { amount: number; unit: "days" | "weeks" };
  busy: boolean;
  pending: boolean;
  onRun: (key: string, body: Record<string, unknown>) => void;
}) {
  const [amount, setAmount] = useState(String(keep.amount));
  const [unit, setUnit] = useState<"days" | "weeks">(keep.unit);
  const [invalid, setInvalid] = useState(false);
  const max = unit === "weeks" ? 12 : 90;

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number(amount);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        onRun(`${pluginId}:${cameraId}:keep`, {
          action: "keep",
          id: pluginId,
          cameraId,
          amount: parsed,
          unit,
        });
      }}
    >
      <label className="text-xs text-muted" htmlFor={`keep-${cameraId}`}>
        Keep
      </label>
      <input
        id={`keep-${cameraId}`}
        type="number"
        min={1}
        max={max}
        value={amount}
        disabled={busy}
        onChange={(event) => {
          setAmount(event.target.value);
          setInvalid(false);
        }}
        className="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
      />
      <select
        value={unit}
        disabled={busy}
        aria-label="Keep unit"
        onChange={(event) => {
          const next = event.target.value === "weeks" ? "weeks" : "days";
          setUnit(next);
          setInvalid(false);
        }}
        className="rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
      >
        <option value="days">days</option>
        <option value="weeks">weeks</option>
      </select>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border border-line px-2 py-1 text-sm text-accent disabled:opacity-50"
      >
        {pending ? "Working…" : "Apply"}
      </button>
      {invalid ? <p className="basis-full text-xs text-danger">Use 1–90 days or 1–12 weeks.</p> : null}
    </form>
  );
}

function cameraToggleLabel(pluginId: string, enabled: boolean): string {
  if (pluginId === "preset-carousel") return enabled ? "Stop" : "Start";
  return enabled ? "Stop" : "Save";
}

function CarouselControl({
  pluginId,
  cameraId,
  seconds,
  presets,
  busyId,
  onRun,
}: {
  pluginId: string;
  cameraId: string;
  seconds: number;
  presets: { token: string; name: string; selected: boolean; seconds?: number | null }[];
  busyId: string | null;
  onRun: (key: string, body: Record<string, unknown>) => void;
}) {
  const busy = busyId !== null;
  const pendingInterval = busyId === `${pluginId}:${cameraId}:interval`;
  const [amount, setAmount] = useState(String(seconds));
  const [invalid, setInvalid] = useState(false);

  function togglePreset(token: string) {
    const next = presets.flatMap((preset) => {
      const selected = preset.token === token ? !preset.selected : preset.selected;
      return selected ? [preset.token] : [];
    });
    onRun(`${pluginId}:${cameraId}:presets`, {
      action: "presets",
      id: pluginId,
      cameraId,
      tokens: next.length === presets.length ? null : next,
    });
  }

  return (
    <div className="mt-2 grid gap-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(amount);
          if (!Number.isInteger(parsed) || parsed < 10 || parsed > 3600) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onRun(`${pluginId}:${cameraId}:interval`, {
            action: "interval",
            id: pluginId,
            cameraId,
            seconds: parsed,
          });
        }}
      >
        <label className="text-xs text-muted" htmlFor={`interval-${cameraId}`}>
          Every
        </label>
        <input
          id={`interval-${cameraId}`}
          type="number"
          min={10}
          max={3600}
          value={amount}
          disabled={busy}
          onChange={(event) => {
            setAmount(event.target.value);
            setInvalid(false);
          }}
          className="w-20 rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
        />
        <span className="text-xs text-muted">sec</span>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-line px-2 py-1 text-sm text-accent disabled:opacity-50"
        >
          {pendingInterval ? "Working…" : "Apply"}
        </button>
        {invalid ? <p className="basis-full text-xs text-danger">Use 10–3600 seconds.</p> : null}
      </form>
      {presets.length > 0 ? (
        <fieldset className="grid gap-1" disabled={busy}>
          <legend className="text-xs text-muted">Presets</legend>
          {presets.map((preset) => (
            <div key={`${preset.token}:${preset.seconds ?? ""}`} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preset.selected}
                  onChange={() => togglePreset(preset.token)}
                />
                <span>{preset.name}</span>
              </label>
              {preset.selected ? (
                <PresetWait
                  pluginId={pluginId}
                  cameraId={cameraId}
                  token={preset.token}
                  name={preset.name}
                  seconds={preset.seconds ?? null}
                  fallback={seconds}
                  busy={busy}
                  pending={busyId === `${pluginId}:${cameraId}:preset:${preset.token}`}
                  onRun={onRun}
                />
              ) : null}
            </div>
          ))}
          <p className="text-xs text-muted">
            New presets stay in the tour while every box is ticked. A blank preset wait uses the camera wait.
          </p>
        </fieldset>
      ) : null}
    </div>
  );
}

function PresetWait({
  pluginId,
  cameraId,
  token,
  name,
  seconds,
  fallback,
  busy,
  pending,
  onRun,
}: {
  pluginId: string;
  cameraId: string;
  token: string;
  name: string;
  seconds: number | null;
  fallback: number;
  busy: boolean;
  pending: boolean;
  onRun: (key: string, body: Record<string, unknown>) => void;
}) {
  const [amount, setAmount] = useState(seconds === null ? "" : String(seconds));
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = amount.trim();
        if (trimmed === "") {
          setInvalid(false);
          onRun(`${pluginId}:${cameraId}:preset:${token}`, {
            action: "preset-interval",
            id: pluginId,
            cameraId,
            token,
            seconds: null,
          });
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isInteger(parsed) || parsed < 10 || parsed > 3600) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        onRun(`${pluginId}:${cameraId}:preset:${token}`, {
          action: "preset-interval",
          id: pluginId,
          cameraId,
          token,
          seconds: parsed,
        });
      }}
    >
      <input
        type="number"
        min={10}
        max={3600}
        value={amount}
        placeholder={String(fallback)}
        aria-label={`Seconds at ${name}`}
        disabled={busy}
        onChange={(event) => {
          setAmount(event.target.value);
          setInvalid(false);
        }}
        className="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
      />
      <span className="text-xs text-muted">sec</span>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border border-line px-2 py-1 text-sm text-accent disabled:opacity-50"
      >
        {pending ? "Working…" : "Apply"}
      </button>
      {invalid ? <p className="basis-full text-xs text-danger">Use 10–3600 seconds.</p> : null}
    </form>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-line px-2 py-1 text-sm text-accent disabled:opacity-50"
    >
      {busy ? "Working…" : label}
    </button>
  );
}
