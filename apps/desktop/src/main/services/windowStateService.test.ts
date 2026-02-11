import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  WindowStateService,
  clampBoundsToDisplay,
  resolveWindowState
} from "./windowStateService.js";

describe("windowStateService", () => {
  it("clamps off-screen saved bounds into the nearest display work area", () => {
    const resolved = resolveWindowState({
      storedState: {
        bounds: {
          x: 5000,
          y: -800,
          width: 1600,
          height: 1200
        },
        isMaximized: false
      },
      defaultBounds: {
        x: 0,
        y: 0,
        width: 1320,
        height: 860
      },
      displays: [
        {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080
        }
      ],
      minWidth: 1100,
      minHeight: 700
    });

    expect(resolved.bounds).toEqual({
      x: 320,
      y: 0,
      width: 1600,
      height: 1080
    });
  });

  it("enforces minimum bounds while staying within display", () => {
    const clamped = clampBoundsToDisplay(
      {
        x: -40,
        y: -20,
        width: 400,
        height: 300
      },
      {
        x: 100,
        y: 50,
        width: 1280,
        height: 720
      },
      900,
      600
    );

    expect(clamped).toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 600
    });
  });

  it("persists and reloads saved window state", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "actc-window-state-"));
    const service = new WindowStateService(tempRoot);

    service.save({
      bounds: {
        x: 160,
        y: 120,
        width: 1330,
        height: 880
      },
      isMaximized: true
    });

    const loaded = service.load({
      defaultBounds: {
        x: 0,
        y: 0,
        width: 1320,
        height: 860
      },
      displays: [
        {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080
        }
      ],
      minWidth: 1100,
      minHeight: 700
    });

    expect(loaded).toEqual({
      bounds: {
        x: 160,
        y: 120,
        width: 1330,
        height: 880
      },
      isMaximized: true
    });
  });
});
