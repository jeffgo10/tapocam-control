"use client";

import { useState } from "react";
import type { CameraDraft } from "@/lib/types";

const fieldClass =
  "h-11 rounded-xl border border-line bg-background px-3 text-sm outline-none focus:border-accent";

type CameraFormProps = {
  initial: CameraDraft;
  editing: boolean;
  busy: boolean;
  onCancel?: () => void;
  onSubmit: (draft: CameraDraft) => void;
};

export function CameraForm({
  initial,
  editing,
  busy,
  onCancel,
  onSubmit,
}: CameraFormProps) {
  const [draft, setDraft] = useState(initial);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          name="name"
          value={draft.name}
          placeholder="Front door"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Camera IP</span>
        <input
          name="ip"
          autoComplete="off"
          inputMode="decimal"
          placeholder="192.168.1.50"
          value={draft.ip}
          onChange={(event) => setDraft({ ...draft, ip: event.target.value })}
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Username</span>
        <input
          name="username"
          autoComplete="username"
          value={draft.username}
          onChange={(event) => setDraft({ ...draft, username: event.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder={editing ? "Leave blank to keep the saved password" : ""}
          value={draft.password}
          onChange={(event) => setDraft({ ...draft, password: event.target.value })}
          className={fieldClass}
        />
      </label>
      <div className="flex gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-xl border border-line text-sm"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-ink disabled:opacity-60"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Save camera"}
        </button>
      </div>
    </form>
  );
}
