// Agent endpoints, on top of the shared API client.
import { api } from "../../api/client.js";

export const agentApi = {
  status: () => api.get("/agent/status"),
  listConversations: () => api.get("/agent/conversations"),
  createConversation: () => api.post("/agent/conversations"),
  getConversation: (id) => api.get(`/agent/conversations/${id}`),
  deleteConversation: (id) => api.del(`/agent/conversations/${id}`),
  sendMessage: (id, message) => api.post(`/agent/conversations/${id}/messages`, { message }),
  approve: (actionId) => api.post(`/agent/actions/${actionId}/approve`),
  reject: (actionId) => api.post(`/agent/actions/${actionId}/reject`),
};
