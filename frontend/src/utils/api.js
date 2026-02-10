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
