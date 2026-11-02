export type CameraCredentials = {
  ip: string;
  username: string;
  password: string;
};

export type SavedCamera = {
  id: string;
  name: string;
  ip: string;
  username: string;
};

export type CameraDraft = {
  name: string;
  ip: string;
  username: string;
  password: string;
};

export type CameraPatch = {
  name?: string;
  ip?: string;
  username?: string;
  password?: string;
};

export type PtzCommand = "up" | "down" | "left" | "right";

export type PresetAction = "list" | "goto";

export type Preset = {
  name: string;
  token: string;
};

export type ApiFailure = {
  success: false;
  error: string;
};

export type CameraResponse = {
  success: true;
  streamUrl: string;
};

export type PtzResponse = {
  success: true;
};

export type PresetListResponse = {
  success: true;
  presets: Preset[];
};

export type PresetGotoResponse = {
  success: true;
};
