import type { PtzCommand } from "@/lib/types";

export const PTZ_SPEED = 0.5;
export const PTZ_STEP_MS = 500;

export type PtzVelocity = {
  x: number;
  y: number;
  z: number;
};

const VECTORS: Record<PtzCommand, PtzVelocity> = {
  up: { x: 0, y: PTZ_SPEED, z: 0 },
  down: { x: 0, y: -PTZ_SPEED, z: 0 },
  left: { x: -PTZ_SPEED, y: 0, z: 0 },
  right: { x: PTZ_SPEED, y: 0, z: 0 },
};

export function velocityFor(command: PtzCommand): PtzVelocity {
  return VECTORS[command];
}
