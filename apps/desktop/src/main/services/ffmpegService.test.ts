import { describe, expect, it } from "vitest";

import { buildLoopStreamArgs } from "./ffmpegService.js";

describe("ffmpeg arg builders", () => {
  it("buildLoopStreamArgs loops input video into ingest url", () => {
    const args = buildLoopStreamArgs("input.mp4", "rtmps://a.rtmp.youtube.com/live2/key", 180);

    expect(args).toContain("-stream_loop");
    expect(args).toContain("-1");
    expect(args).toContain("-i");
    expect(args).toContain("input.mp4");
    expect(args).toContain("-t");
    expect(args).toContain("180");
    expect(args.at(-1)).toContain("rtmps://");
  });
});
