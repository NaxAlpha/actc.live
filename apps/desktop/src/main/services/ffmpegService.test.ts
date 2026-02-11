import { describe, expect, it } from "vitest";

import { buildLoopStreamArgs, buildTrimArgs } from "./ffmpegService.js";

describe("ffmpeg arg builders", () => {
  it("buildTrimArgs includes start and end markers", () => {
    const args = buildTrimArgs("input.mp4", "out.mp4", { startSec: 3, endSec: 12 });

    expect(args).toContain("-ss");
    expect(args).toContain("3");
    expect(args).toContain("-to");
    expect(args).toContain("12");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("buildLoopStreamArgs loops clip into ingest url", () => {
    const args = buildLoopStreamArgs("clip.mp4", "rtmps://a.rtmp.youtube.com/live2/key", 180);

    expect(args).toContain("-stream_loop");
    expect(args).toContain("-1");
    expect(args).toContain("-t");
    expect(args).toContain("180");
    expect(args.at(-1)).toContain("rtmps://");
  });
});
