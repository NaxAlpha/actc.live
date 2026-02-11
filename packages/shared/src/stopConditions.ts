import type { EffectiveDurationComputation, EffectiveDurationInput } from "./types.js";
import { ensureValidEndAt } from "./validators.js";

const assertPositive = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
};

export const computeEffectiveDuration = (
  input: EffectiveDurationInput
): EffectiveDurationComputation => {
  const nowUtcMs = input.nowUtcMs ?? Date.now();
  const { clipDurationSec, stop } = input;

  assertPositive(clipDurationSec, "clipDurationSec");

  const candidates: EffectiveDurationComputation["candidates"] = [];

  if (stop.maxRepeats) {
    const repeatsDuration = clipDurationSec * stop.maxRepeats;
    assertPositive(repeatsDuration, "duration by repeats");
    candidates.push({ reason: "repeats", durationSec: repeatsDuration });
  }

  if (stop.maxDurationSec) {
    assertPositive(stop.maxDurationSec, "maxDurationSec");
    candidates.push({ reason: "maxDuration", durationSec: stop.maxDurationSec });
  }

  if (stop.endAtIsoUtc) {
    const endAtDuration = ensureValidEndAt(stop.endAtIsoUtc, nowUtcMs);
    candidates.push({ reason: "endAt", durationSec: endAtDuration });
  }

  if (candidates.length === 0) {
    throw new Error("At least one stop condition is required");
  }

  const effectiveDurationSec = Math.min(...candidates.map((candidate) => candidate.durationSec));

  if (!Number.isFinite(effectiveDurationSec) || effectiveDurationSec <= 0) {
    throw new Error("Computed effective duration is not positive");
  }

  return {
    effectiveDurationSec,
    candidates
  };
};
