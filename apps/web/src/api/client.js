// The one place that talks HTTP to the API: auth header, JSON, error shape, 401 handling.

const TOKEN_KEY = "authToken";
const USER_KEY = "authUser";

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const session = {
  load() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      return { token, user: JSON.parse(localStorage.getItem(USER_KEY)) };
    } catch {
      return { token, user: null };
    }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

/** Fired when the server rejects our token; AuthProvider listens and logs out. */
export const SESSION_EXPIRED_EVENT = "auth:session-expired";

export async function request(method, path, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0, "NETWORK_ERROR");
  }

  if (res.status === 401 && token) {
    session.clear();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data.details) ? data.details : null;
    const message = (data.error || `Request failed (${res.status})`) + (details ? `: ${details.join("; ")}` : "");
    throw new ApiError(message, res.status, data.code, details);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body ?? {}),
  put: (path, body) => request("PUT", path, body ?? {}),
  del: (path) => request("DELETE", path),
};
