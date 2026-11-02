declare module "node-onvif" {
  export type OnvifVelocity = {
    x: number;
    y: number;
    z: number;
  };

  export type OnvifDeviceInstance = {
    init(): Promise<unknown>;
    getCurrentProfile(): { token: string };
    ptzStop(): Promise<unknown>;
    services: {
      ptz: {
        continuousMove(params: {
          ProfileToken: string;
          Velocity: OnvifVelocity;
          Timeout?: number;
        }): Promise<unknown>;
        getPresets(params: {
          ProfileToken: string;
        }): Promise<{ data: unknown }>;
        gotoPreset(params: {
          ProfileToken: string;
          PresetToken: string;
          Speed?: OnvifVelocity;
        }): Promise<unknown>;
      } | null;
    };
  };

  type OnvifModule = {
    OnvifDevice: new (params: {
      xaddr: string;
      user: string;
      pass: string;
    }) => OnvifDeviceInstance;
  };

  const onvif: OnvifModule;
  export default onvif;
}
