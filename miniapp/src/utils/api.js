const API_BASE = "https://chat.chuli.win";

async function ensureToken() {
  let token = localStorage.getItem("whisper_token");
  if (!token) {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "chuli2026" }),
    });
    const data = await res.json();
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

  if (res.status === 401) {
    localStorage.removeItem("whisper_token");
    token = await ensureToken();
    res = await doFetch(token);
  }

  if (res.status === 204) return null;
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}
