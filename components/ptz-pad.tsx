"use client";

import { useEffect } from "react";
import type { PtzCommand } from "@/lib/types";

const DIRECTIONS: Array<{ command: PtzCommand; label: string; icon: string }> = [
  { command: "up", label: "Tilt up", icon: "M12 6l-6 7h12z" },
  { command: "left", label: "Pan left", icon: "M6 12l7-6v12z" },
  { command: "right", label: "Pan right", icon: "M18 12l-7-6v12z" },
  { command: "down", label: "Tilt down", icon: "M12 18l6-7H6z" },
];

type PtzPadProps = {
  disabled: boolean;
  busy: boolean;
  onMove: (command: PtzCommand) => void;
};

export function PtzPad({ disabled, busy, onMove }: PtzPadProps) {
  useEffect(() => {
    if (disabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const command = keyCommand(event.key);
      if (!command) return;
      event.preventDefault();
      onMove(command);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onMove]);

  return (
    <section className="rounded-3xl border border-line bg-panel p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Pan and tilt</h2>
        <span className="text-xs text-muted">0.5s step</span>
      </div>
      <div className="mx-auto grid w-fit grid-cols-3 gap-2">
        <span />
        <MoveButton
          direction={DIRECTIONS[0]}
          disabled={disabled || busy}
          onMove={onMove}
        />
        <span />
        <MoveButton
          direction={DIRECTIONS[1]}
          disabled={disabled || busy}
          onMove={onMove}
        />
        <span className="grid size-16 place-items-center text-[10px] tracking-wide text-muted uppercase">
          {busy ? "Moving" : "Step"}
        </span>
        <MoveButton
          direction={DIRECTIONS[2]}
          disabled={disabled || busy}
          onMove={onMove}
        />
        <span />
        <MoveButton
          direction={DIRECTIONS[3]}
          disabled={disabled || busy}
          onMove={onMove}
        />
        <span />
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Each press moves the camera, then stops. Arrow keys work outside the
        form.
      </p>
    </section>
  );
}

function MoveButton({
  direction,
  disabled,
  onMove,
}: {
  direction: (typeof DIRECTIONS)[number];
  disabled: boolean;
  onMove: (command: PtzCommand) => void;
}) {
  return (
    <button
      type="button"
      aria-label={direction.label}
      disabled={disabled}
      onClick={() => onMove(direction.command)}
      className="grid size-16 place-items-center rounded-2xl border border-line bg-background text-foreground transition active:bg-accent active:text-accent-ink disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
        <path d={direction.icon} />
      </svg>
    </button>
  );
}

function keyCommand(key: string): PtzCommand | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}
