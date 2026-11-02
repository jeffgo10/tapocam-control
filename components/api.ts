export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { success?: boolean; error?: string })
    | null;
  if (!response.ok || !payload || payload.success === false) {
    throw new Error(payload?.error || "Request failed.");
  }
  return payload;
}
