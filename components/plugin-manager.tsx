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
                      label={camera.enabled ? "Stop" : "Save"}
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
