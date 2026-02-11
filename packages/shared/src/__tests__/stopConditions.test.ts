import { describe, expect, it } from "vitest";

import { computeEffectiveDuration } from "../stopConditions.js";

describe("computeEffectiveDuration", () => {
  it("picks minimum among enabled stop conditions", () => {
    const now = Date.parse("2026-02-11T12:00:00Z");
    const endAt = new Date(now + 45_000).toISOString();

    const result = computeEffectiveDuration({
      clipDurationSec: 10,
      stop: {
        maxRepeats: 8,
        maxDurationSec: 50,
        endAtIsoUtc: endAt,
        strategy: "earliest-wins"
      },
      nowUtcMs: now
    });

    expect(result.effectiveDurationSec).toBe(45);
  });

  it("throws when computed duration is non-positive", () => {
    const now = Date.parse("2026-02-11T12:00:00Z");

    expect(() =>
      computeEffectiveDuration({
        clipDurationSec: 10,
        stop: {
          endAtIsoUtc: new Date(now - 1000).toISOString(),
          strategy: "earliest-wins"
        },
        nowUtcMs: now
      })
    ).toThrow(/not positive/i);
  });
});
