import { api, request } from "../../api/client.js";

export const automationsKey = ["automations"];

export const automationsApi = {
  list: () => api.get("/automations"),
  create: (data) => api.post("/automations", data),
  update: (id, changes) => request("PATCH", `/automations/${id}`, changes),
  remove: (id) => api.del(`/automations/${id}`),
  run: (id) => api.post(`/automations/${id}/run`),
  runs: (id) => api.get(`/automations/${id}/runs`),
};
