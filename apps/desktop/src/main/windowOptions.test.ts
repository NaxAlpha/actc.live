import { describe, expect, it } from "vitest";

import { buildMainWindowOptions } from "./windowOptions.js";

const isMac = process.platform === "darwin";

describe("buildMainWindowOptions", () => {
  it("uses vibrancy and hidden titlebar when transparency is enabled on macOS", () => {
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

    expect(options.fullscreenable).toBe(false);
    expect(options.width).toBe(1320);
    expect(options.height).toBe(860);

    if (isMac) {
      expect(options.transparent).toBe(true);
      expect(options.frame).toBe(true);
      expect(options.titleBarStyle).toBe("hiddenInset");
      expect(options.trafficLightPosition).toEqual({ x: 16, y: 12 });
      expect(options.vibrancy).toBe("under-window");
      expect(options.backgroundColor).toBe("#00000000");
    } else {
      expect(options.transparent).toBe(false);
      expect(options.frame).toBe(false);
      expect(options.backgroundColor).toBe("#f0f0f0");
    }
  });

  it("uses default frame and solid background when transparency is disabled", () => {
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
    expect(options.backgroundColor).toBe("#f0f0f0");

    if (isMac) {
      expect(options.frame).toBe(true);
      expect(options.titleBarStyle).toBe("default");
      expect(options.vibrancy).toBeUndefined();
    } else {
      expect(options.frame).toBe(true);
    }
  });
});
