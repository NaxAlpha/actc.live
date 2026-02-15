import { describe, expect, it } from "vitest";

import { canTransitionSession, canTransitionStream } from "../stateMachine.js";

describe("state machines", () => {
  it("allows expected session transitions", () => {
    expect(canTransitionSession("idle", "preparing-media")).toBe(true);
    expect(canTransitionSession("testing", "live")).toBe(true);
    expect(canTransitionSession("idle", "preparing-clip" as never)).toBe(false);
    expect(canTransitionSession("completed", "live")).toBe(false);
  });

  it("allows expected stream transitions", () => {
    expect(canTransitionStream("testing", "live")).toBe(true);
    expect(canTransitionStream("live", "testing")).toBe(false);
  });
});
