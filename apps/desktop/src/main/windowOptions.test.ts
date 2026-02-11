import { describe, expect, it } from "vitest";

import { buildMainWindowOptions } from "./windowOptions.js";

describe("buildMainWindowOptions", () => {
  it("uses native frame controls and disables fullscreen", () => {
    const options = buildMainWindowOptions({
      bounds: {
        x: 200,
        y: 100,
        width: 1320,
        height: 860
      },
      minWidth: 1100,
      minHeight: 700,
      transparencyDisabled: false,
      preloadPath: "/tmp/preload.cjs"
    });

    expect(options.frame).toBe(true);
    expect(options.transparent).toBe(false);
    expect(options.fullscreenable).toBe(false);
    expect(options.backgroundColor).toBe("#f2f1ee");
    expect(options.width).toBe(1320);
    expect(options.height).toBe(860);
  });

  it("keeps opaque background even when transparency disable flag is set", () => {
    const options = buildMainWindowOptions({
      bounds: {
        x: 0,
        y: 0,
        width: 1320,
        height: 860
      },
      minWidth: 1100,
      minHeight: 700,
      transparencyDisabled: true,
      preloadPath: "/tmp/preload.cjs"
    });

    expect(options.transparent).toBe(false);
    expect(options.backgroundColor).toBe("#f2f1ee");
  });
});
