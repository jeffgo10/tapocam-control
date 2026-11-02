export function streamPathFor(cameraId: string): string {
  return `cam-${cameraId}`;
}

export function castSourcePathFor(cameraId: string): string {
  return `sub-${cameraId}`;
}
