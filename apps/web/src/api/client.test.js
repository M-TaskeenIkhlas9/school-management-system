import { afterEach, describe, expect, it, vi } from "vitest";
import { api, session, SESSION_EXPIRED_EVENT } from "./client.js";

const respond = (status, body) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("sends the stored token and returns JSON", async () => {
    session.save("tok-123", { id: 1 });
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/students")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/students", expect.objectContaining({ method: "GET" }));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-123");
  });

  it("includes validation details in the error message", async () => {
    vi.stubGlobal(
      "fetch",
      respond(400, { error: "Validation failed", code: "VALIDATION_ERROR", details: ["name: is required"] })
    );
    await expect(api.post("/students", {})).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed: name: is required",
    });
  });

  it("clears the session and announces expiry on 401 when logged in", async () => {
    session.save("expired", { id: 1 });
    vi.stubGlobal("fetch", respond(401, { error: "Token expired" }));
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await expect(api.get("/dashboard")).rejects.toMatchObject({ status: 401 });
    expect(session.load()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  it("reports an unreachable server clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.get("/health")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
