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
  const options: BrowserWindowConstructorOptions = {
    ...input.bounds,
    minWidth: input.minWidth,
    minHeight: input.minHeight,
    frame: true,
    transparent: false,
    backgroundColor: "#f2f1ee",
    fullscreenable: false,
    hasShadow: true,
    show: false,
    title: "ACTC Live",
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
