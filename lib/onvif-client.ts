import onvif from "node-onvif";
import { normalizePresets } from "@/lib/presets";
import { PTZ_SPEED, PTZ_STEP_MS, velocityFor } from "@/lib/ptz";
import type { CameraCredentials, Preset, PtzCommand } from "@/lib/types";

type OnvifDevice = InstanceType<typeof onvif.OnvifDevice>;

type CacheEntry = {
  device: OnvifDevice;
  expiresAt: number;
};

const CACHE_MS = 5 * 60 * 1000;
const devices = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<OnvifDevice>>();
const moveQueues = new Map<string, Promise<void>>();

function cacheKey(credentials: CameraCredentials): string {
  return `${credentials.ip}\0${credentials.username}\0${credentials.password}`;
}

function deviceUrl(ip: string): string {
  return `http://${ip}:2020/onvif/device_service`;
}

async function connect(credentials: CameraCredentials): Promise<OnvifDevice> {
  const key = cacheKey(credentials);
  const cached = devices.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.device;

  const existing = pending.get(key);
  if (existing) return existing;

  const job = (async () => {
    const device = new onvif.OnvifDevice({
      xaddr: deviceUrl(credentials.ip),
      user: credentials.username,
      pass: credentials.password,
    });
    try {
      await device.init();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "connection failed";
      throw new Error(
        `Could not authenticate with the camera ONVIF service on port 2020. ${detail}`,
      );
    }
    if (!device.services.ptz) {
      throw new Error("This camera did not expose an ONVIF PTZ service.");
    }
    devices.set(key, { device, expiresAt: Date.now() + CACHE_MS });
    return device;
  })().finally(() => {
    pending.delete(key);
  });

  pending.set(key, job);
  return job;
}

function forget(credentials: CameraCredentials) {
  devices.delete(cacheKey(credentials));
}

function enqueue(ip: string, task: () => Promise<void>): Promise<void> {
  const previous = moveQueues.get(ip) ?? Promise.resolve();
  const run = previous.then(task, task);
  moveQueues.set(
    ip,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function profileToken(device: OnvifDevice): string {
  const profile = device.getCurrentProfile();
  if (!profile?.token) {
    throw new Error("The camera did not return an ONVIF media profile.");
  }
  return profile.token;
}

function ptzService(device: OnvifDevice) {
  const ptz = device.services.ptz;
  if (!ptz) throw new Error("This camera did not expose an ONVIF PTZ service.");
  return ptz;
}

export async function moveCamera(
  credentials: CameraCredentials,
  command: PtzCommand,
): Promise<void> {
  const device = await connect(credentials);
  const velocity = velocityFor(command);

  try {
    await enqueue(credentials.ip, async () => {
      await ptzService(device).continuousMove({
        ProfileToken: profileToken(device),
        Velocity: velocity,
        // One second is the safety limit. Stop below cuts the move to a step.
        Timeout: 1,
      });
      await delay(PTZ_STEP_MS);
      await device.ptzStop();
    });
  } catch (error) {
    forget(credentials);
    throw error;
  }
}

export async function listPresets(
  credentials: CameraCredentials,
): Promise<Preset[]> {
  const device = await connect(credentials);
  try {
    const result = await ptzService(device).getPresets({
      ProfileToken: profileToken(device),
    });
    return normalizePresets(result.data);
  } catch (error) {
    forget(credentials);
    throw error;
  }
}

export async function gotoPreset(
  credentials: CameraCredentials,
  presetToken: string,
): Promise<void> {
  const device = await connect(credentials);
  try {
    await ptzService(device).gotoPreset({
      ProfileToken: profileToken(device),
      PresetToken: presetToken,
      Speed: { x: PTZ_SPEED, y: PTZ_SPEED, z: PTZ_SPEED },
    });
  } catch (error) {
    forget(credentials);
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
