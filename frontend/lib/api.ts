export async function api<T>(path: string, init?: RequestInit & { admin?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.admin) headers.set("X-Admin-Token", init.admin);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {}
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json();
}
