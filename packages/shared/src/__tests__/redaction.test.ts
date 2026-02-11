import { describe, expect, it } from "vitest";

import { redactSensitive } from "../redaction.js";

describe("redactSensitive", () => {
  it("redacts stream key in ingest URL", () => {
    const input = "rtmps://a.rtmp.youtube.com/live2/my-secret-stream-key";
    const redacted = redactSensitive(input);

    expect(redacted).not.toContain("my-secret-stream-key");
    expect(redacted).toContain("***");
  });
});
