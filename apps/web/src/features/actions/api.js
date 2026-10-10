import { api, request } from "../../api/client.js";

export const actionsApi = {
  list: (status) => api.get(`/assistant/actions${status ? `?status=${status}` : ""}`),
  get: (id) => api.get(`/assistant/actions/${id}`),
  edit: (id, changes) => request("PATCH", `/assistant/actions/${id}`, changes),
  approve: (id) => api.post(`/assistant/actions/${id}/approve`),
  reject: (id, reason) => api.post(`/assistant/actions/${id}/reject`, reason ? { reason } : {}),
  deliveries: (params) => api.get(`/messages/deliveries?${new URLSearchParams(params)}`),
};
