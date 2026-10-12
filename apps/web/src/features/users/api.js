import { api, request } from "../../api/client.js";

export const usersApi = {
  list: () => api.get("/users"),
  roles: () => api.get("/users/roles"),
  activity: (params) => api.get(`/users/activity?${new URLSearchParams(params)}`),
  create: (data) => api.post("/users", data),
  update: (id, changes) => request("PATCH", `/users/${id}`, changes),
  signOut: (id) => api.post(`/users/${id}/sign-out`),
};

export const usersKey = ["users"];
