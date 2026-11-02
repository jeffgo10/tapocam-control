import type { CameraCredentials } from "@/lib/types";

export function buildRtspUrl(
  credentials: CameraCredentials,
  stream: "stream1" | "stream2" = "stream1",
): string {
  const username = encodeURIComponent(credentials.username);
  const password = encodeURIComponent(credentials.password);
  return `rtsp://${username}:${password}@${credentials.ip}:554/${stream}`;
}

export function redactSecrets(message: string, secrets: string[]): string {
  return secrets.reduce((text, secret) => {
    if (!secret) return text;
    return text.split(secret).join("••••");
  }, message);
}
