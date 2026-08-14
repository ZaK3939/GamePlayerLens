import {describe, expect, it} from "vitest";
import {createResultStore} from "./results.js";
import {
  imageEnvelope,
  jsonEnvelope,
  trackManualPromptEvidence,
  trackedJsonEnvelope,
} from "./mcp-responses.js";

const OBSERVED_AT = "2026-08-14T12:00:00+04:00";
const RESULT_HANDLE = "00000000-0000-4000-8000-000000000001";

describe("MCP response envelopes", () => {
  it("keeps text and structured JSON responses identical", () => {
    const response = jsonEnvelope({
      data: {appid: 1145360, name: "Hades"},
      warnings: ["bounded fixture"],
      meta: {observedAt: OBSERVED_AT},
    });

    expect(JSON.parse(response.content[0]?.text ?? "null"))
      .toEqual(response.structuredContent);
    expect(response.structuredContent).toEqual({
      data: {appid: 1145360, name: "Hades"},
      warnings: ["bounded fixture"],
      meta: {observedAt: OBSERVED_AT},
    });
  });

  it("tracks exact-save results before formatting the response", () => {
    const store = createResultStore({idFactory: () => RESULT_HANDLE});
    const response = trackedJsonEnvelope(store, "steam_fetch", {
      data: {appid: 1145360},
      warnings: [],
      meta: {observedAt: OBSERVED_AT},
    });

    expect(response.structuredContent.meta?.resultHandle).toBe(RESULT_HANDLE);
    expect(store.get(RESULT_HANDLE)).toEqual({
      sourceTool: "steam_fetch",
      observedAt: OBSERVED_AT,
      payload: response.structuredContent,
    });
  });

  it("tracks manual prompt evidence without duplicating its payload", () => {
    const store = createResultStore({idFactory: () => RESULT_HANDLE});
    const envelope = {
      data: {sessionId: "fixture-session"},
      warnings: [],
      meta: {observedAt: OBSERVED_AT},
    } as const;

    expect(trackManualPromptEvidence(store, envelope)).toEqual({
      sourceTool: "manual",
      observedAt: OBSERVED_AT,
      resultHandle: RESULT_HANDLE,
    });
    expect(store.get(RESULT_HANDLE).payload).toMatchObject({
      data: envelope.data,
      meta: {observedAt: OBSERVED_AT, resultHandle: RESULT_HANDLE},
    });
  });

  it("appends image content after the JSON envelope", () => {
    const response = imageEnvelope({
      data: {id: "capture-1", imageIncluded: true},
      warnings: [],
      imageContent: {
        type: "image",
        data: "iVBORw0KGgo=",
        mimeType: "image/png",
      },
    });

    expect(response.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(response.structuredContent),
      },
      {
        type: "image",
        data: "iVBORw0KGgo=",
        mimeType: "image/png",
      },
    ]);
  });
});
