import path from "node:path";

import { app, BrowserWindow, screen } from "electron";

import { registerIpcHandlers } from "./ipc.js";
import { createAppContext } from "./services/appContext.js";
import { WindowStateService } from "./services/windowStateService.js";
import { buildMainWindowOptions } from "./windowOptions.js";

const isDev = !app.isPackaged;
const MIN_WINDOW_WIDTH = 860;
const MIN_WINDOW_HEIGHT = 620;
const DEFAULT_WINDOW_BOUNDS = {
  x: 0,
  y: 0,
  width: 1180,
  height: 760
} as const;

const isTransparencyDisabled = process.env.ACTC_DISABLE_WINDOW_TRANSPARENCY === "1";

const createMainWindow = (windowStateService: WindowStateService): BrowserWindow => {
  const restored = windowStateService.load({
    defaultBounds: DEFAULT_WINDOW_BOUNDS,
    displays: screen.getAllDisplays().map((display) => display.workArea),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT
  });

  const window = new BrowserWindow(
    buildMainWindowOptions({
      bounds: restored.bounds,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      transparencyDisabled: isTransparencyDisabled,
      preloadPath: path.join(__dirname, "..", "preload", "index.cjs")
    })
  );

  if (process.platform === "win32" && !isTransparencyDisabled) {
    try {
      (window as unknown as { setBackgroundMaterial: (m: string) => void }).setBackgroundMaterial("mica");
    } catch {
      /* Mica requires Windows 11 22H2+ — silent fallback */
    }
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === "1";

  const persistWindowState = (): void => {
    const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
    windowStateService.save({
      bounds,
      isMaximized: window.isMaximized()
    });
  };

  window.on("resize", persistWindowState);
  window.on("move", persistWindowState);
  window.on("maximize", persistWindowState);
  window.on("unmaximize", persistWindowState);
  window.on("close", persistWindowState);

  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
    if (shouldOpenDevTools) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  if (restored.isMaximized) {
    window.maximize();
  }

  return window;
};

const bootstrap = async (): Promise<void> => {
  const context = await createAppContext();
  const windowStateService = new WindowStateService(app.getPath("userData"));
  const window = createMainWindow(windowStateService);
  const unregister = registerIpcHandlers(context, window);

  window.on("closed", () => {
    unregister();
  });

  app.on("before-quit", () => {
    unregister();
    context.db.close();
  });
};

app.whenReady().then(() => {
  void bootstrap();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
