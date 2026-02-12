const API_BASE = "https://chat.chuli.win";

async function ensureToken() {
  let token = localStorage.getItem("whisper_token");
  if (!token) {
    console.log("[api] No token found, authenticating...");
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "chuli2026" }),
    });
    console.log("[api] Auth response status:", res.status);
    const data = await res.json();
    console.log("[api] Auth response body:", data);
    if (data.success && data.token) {
      token = data.token;
      localStorage.setItem("whisper_token", token);
    } else {
      throw new Error("认证失败");
    }
  }
  return token;
}

export async function apiFetch(path, options = {}) {
  let token = await ensureToken();

  const url = `${API_BASE}${path}`;
  console.log(`[api] ${options.method || "GET"} ${url}`, options.body || "");

  const doFetch = (t) =>
    fetch(url, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(token);
  console.log(`[api] Response ${res.status} for ${path}`);

  if (res.status === 401) {
    console.log("[api] 401 - re-authenticating...");
    localStorage.removeItem("whisper_token");
    token = await ensureToken();
    res = await doFetch(token);
    console.log(`[api] Retry response ${res.status} for ${path}`);
  }

  if (res.status === 204) return null;
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    console.error(`[api] Error for ${path}:`, error);
    throw new Error(error.detail || `请求失败 (${res.status})`);
  }
  const data = await res.json();
  console.log(`[api] Success for ${path}:`, data);
  return data;
}

export async function apiSSE(path, body, onChunk, onDone) {
  let token = await ensureToken();
  const url = `${API_BASE}${path}`;

  const doFetch = (t) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    localStorage.removeItem("whisper_token");
    token = await ensureToken();
    res = await doFetch(token);
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `请求失败 (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") {
        onDone && onDone();
        return;
      }
      try {
        const parsed = JSON.parse(payload);
        onChunk && onChunk(parsed);
      } catch {}
    }
  }
  onDone && onDone();
  return { abortReader: () => reader.cancel() };
}
