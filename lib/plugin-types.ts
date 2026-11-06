export type PluginPresetChoice = {
  token: string;
  name: string;
  selected: boolean;
};

export type PluginCameraSetting = {
  id: string;
  name: string;
  ip: string;
  enabled: boolean;
  status: string;
  keep?: { amount: number; unit: "days" | "weeks" };
  files: { name: string; size: string; modified: string }[];
  intervalSeconds?: number;
  presets?: PluginPresetChoice[];
};

export type PluginSettingsView = {
  summary: string;
  error: string | null;
  cameras: PluginCameraSetting[];
};

export type PluginListing = {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  active: boolean;
  settings: PluginSettingsView | null;
};
