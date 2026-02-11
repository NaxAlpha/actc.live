import fs from "node:fs";
import path from "node:path";

import type { Rectangle } from "electron";

const WINDOW_STATE_FILE = "window-state.json";

type StoredWindowState = {
  bounds?: Partial<Rectangle>;
  isMaximized?: boolean;
};

type ResolveWindowStateInput = {
  storedState: StoredWindowState | null;
  defaultBounds: Rectangle;
  displays: Rectangle[];
  minWidth: number;
  minHeight: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const intersectionArea = (a: Rectangle, b: Rectangle): number => {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return (right - left) * (bottom - top);
};

const normalizeSize = (
  bounds: Rectangle,
  display: Rectangle,
  minWidth: number,
  minHeight: number
): Pick<Rectangle, "width" | "height"> => {
  const width = clamp(bounds.width, minWidth, display.width);
  const height = clamp(bounds.height, minHeight, display.height);
  return { width, height };
};

export const clampBoundsToDisplay = (
  bounds: Rectangle,
  display: Rectangle,
  minWidth: number,
  minHeight: number
): Rectangle => {
  const size = normalizeSize(bounds, display, minWidth, minHeight);

  const xMax = display.x + display.width - size.width;
  const yMax = display.y + display.height - size.height;

  return {
    x: clamp(bounds.x, display.x, xMax),
    y: clamp(bounds.y, display.y, yMax),
    width: size.width,
    height: size.height
  };
};

const centerInDisplay = (
  bounds: Rectangle,
  display: Rectangle,
  minWidth: number,
  minHeight: number
): Rectangle => {
  const size = normalizeSize(bounds, display, minWidth, minHeight);

  return {
    x: Math.round(display.x + (display.width - size.width) / 2),
    y: Math.round(display.y + (display.height - size.height) / 2),
    width: size.width,
    height: size.height
  };
};

const toStoredBounds = (
  stored: StoredWindowState | null,
  fallback: Rectangle
): Rectangle => {
  const raw = stored?.bounds;

  return {
    x: isFiniteNumber(raw?.x) ? raw.x : fallback.x,
    y: isFiniteNumber(raw?.y) ? raw.y : fallback.y,
    width: isFiniteNumber(raw?.width) ? raw.width : fallback.width,
    height: isFiniteNumber(raw?.height) ? raw.height : fallback.height
  };
};

const pickDisplay = (candidate: Rectangle, displays: Rectangle[]): Rectangle => {
  const sorted = [...displays].sort(
    (left, right) => intersectionArea(right, candidate) - intersectionArea(left, candidate)
  );

  return sorted[0] ?? {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };
};

export const resolveWindowState = (input: ResolveWindowStateInput): {
  bounds: Rectangle;
  isMaximized: boolean;
} => {
  const fallbackDisplay = input.displays[0] ?? {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };

  const centeredDefault = centerInDisplay(
    input.defaultBounds,
    fallbackDisplay,
    input.minWidth,
    input.minHeight
  );

  const candidate = toStoredBounds(input.storedState, centeredDefault);
  const targetDisplay = pickDisplay(candidate, input.displays);
  const bounds = clampBoundsToDisplay(candidate, targetDisplay, input.minWidth, input.minHeight);

  return {
    bounds,
    isMaximized: Boolean(input.storedState?.isMaximized)
  };
};

export class WindowStateService {
  private readonly filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, WINDOW_STATE_FILE);
  }

  load(input: Omit<ResolveWindowStateInput, "storedState">): {
    bounds: Rectangle;
    isMaximized: boolean;
  } {
    const storedState = this.readStoredState();
    return resolveWindowState({
      ...input,
      storedState
    });
  }

  save(input: { bounds: Rectangle; isMaximized: boolean }): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    const payload: StoredWindowState = {
      bounds: {
        x: input.bounds.x,
        y: input.bounds.y,
        width: input.bounds.width,
        height: input.bounds.height
      },
      isMaximized: input.isMaximized
    };

    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  private readStoredState(): StoredWindowState | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as StoredWindowState;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      return parsed;
    } catch (_error) {
      return null;
    }
  }
}
