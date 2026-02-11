import { describe, expect, it } from "vitest";

import { sessionConfigSchema } from "../validators.js";

const baseStop = {
  strategy: "earliest-wins" as const,
  maxDurationSec: 60
};

describe("sessionConfigSchema", () => {
  it("validates create-new mode", () => {
    const parsed = sessionConfigSchema.parse({
      profileId: "p1",
      videoPath: "/tmp/video.mp4",
      trim: { startSec: 0, endSec: 15 },
      stop: baseStop,
      broadcastMode: "create-new",
      newBroadcast: {
        title: "Test",
        privacyStatus: "unlisted",
        scheduledStartIsoUtc: "2026-02-11T12:05:00.000Z",
        latencyPreference: "low"
      }
    });

    expect(parsed.broadcastMode).toBe("create-new");
  });

  it("requires existing broadcast id for reuse", () => {
    expect(() =>
      sessionConfigSchema.parse({
        profileId: "p1",
        videoPath: "/tmp/video.mp4",
        trim: { startSec: 0, endSec: 15 },
        stop: baseStop,
        broadcastMode: "reuse-existing"
      })
    ).toThrow(/existingBroadcastId/i);
  });
});
