import { describe, expect, it } from "vitest";
import { parseSseChunk } from "./api.js";

describe("parseSseChunk", () => {
  it("returns complete events and keeps a partial one for the next chunk", () => {
    const [events, rest] = parseSseChunk('event: thinking\ndata: {"step":1}\n\nevent: tool_started\ndata: {"lab');
    expect(events).toEqual([{ event: "thinking", data: { step: 1 } }]);
    const [more] = parseSseChunk(rest + 'el":"Looking up"}\n\n');
    expect(more).toEqual([{ event: "tool_started", data: { label: "Looking up" } }]);
  });
});
