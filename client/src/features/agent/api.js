// Small fetch wrapper for the agent endpoints (auth header, 401 handling, JSON errors).

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const token = localStorage.getItem("authToken");
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    window.location.reload();
    throw new ApiError("Session expired", 401, "AUTH_REQUIRED");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
  return data;
}

export const agentApi = {
  status: () => request("GET", "/agent/status"),
  listConversations: () => request("GET", "/agent/conversations"),
  createConversation: () => request("POST", "/agent/conversations"),
  getConversation: (id) => request("GET", `/agent/conversations/${id}`),
  deleteConversation: (id) => request("DELETE", `/agent/conversations/${id}`),
  sendMessage: (id, message) => request("POST", `/agent/conversations/${id}/messages`, { message }),
  approve: (actionId) => request("POST", `/agent/actions/${actionId}/approve`),
  reject: (actionId) => request("POST", `/agent/actions/${actionId}/reject`),
};
