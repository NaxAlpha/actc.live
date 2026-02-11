import path from "node:path";

import { app, BrowserWindow } from "electron";

import { registerIpcHandlers } from "./ipc.js";
import { createAppContext } from "./services/appContext.js";

const isDev = !app.isPackaged;

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: "ACTC Live",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === "1";

  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
    if (shouldOpenDevTools) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  return window;
};

const bootstrap = async (): Promise<void> => {
  const context = await createAppContext();
  const window = createMainWindow();
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
