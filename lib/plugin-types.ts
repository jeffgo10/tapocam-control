export type PluginCameraSetting = {
  id: string;
  name: string;
  ip: string;
  enabled: boolean;
  status: string;
  files: { name: string; size: string; modified: string }[];
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
