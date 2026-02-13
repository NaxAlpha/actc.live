import type { BrowserWindowConstructorOptions, Rectangle } from "electron";

type BuildMainWindowOptionsInput = {
  bounds: Rectangle;
  minWidth: number;
  minHeight: number;
  transparencyDisabled: boolean;
  preloadPath: string;
};

export const buildMainWindowOptions = (
  input: BuildMainWindowOptionsInput
): BrowserWindowConstructorOptions => {
  const isMac = process.platform === "darwin";
  const useVibrancy = !input.transparencyDisabled;

  const options: BrowserWindowConstructorOptions = {
    ...input.bounds,
    minWidth: input.minWidth,
    minHeight: input.minHeight,
    resizable: true,
    fullscreenable: false,
    hasShadow: true,
    show: false,
    title: "ACTC Live",

    ...(isMac
      ? {
          titleBarStyle: useVibrancy ? "hiddenInset" : "default",
          ...(useVibrancy ? { trafficLightPosition: { x: 16, y: 12 } } : {}),
          frame: true
        }
      : {
          frame: !useVibrancy
        }),

    ...(isMac && useVibrancy
      ? {
          transparent: true,
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
          backgroundColor: "#00000000"
        }
      : {
          transparent: false,
          backgroundColor: "#f0f0f0"
        }),

    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  };

  return options;
};
