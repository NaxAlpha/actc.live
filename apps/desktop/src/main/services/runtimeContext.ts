import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { app } from "electron";

export type RuntimePaths = {
  userDataDir: string;
  tempDir: string;
  dbPath: string;
  ffmpegResourceDir: string;
  appName: string;
};

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

export const resolveRuntimePaths = (): RuntimePaths => {
  const userDataDir = app.getPath("userData");
  const tempDir = path.join(os.tmpdir(), "actc-live");
  const dbPath = path.join(userDataDir, "actc-live.sqlite");

  const ffmpegResourceDir = app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg")
    : path.resolve(__dirname, "..", "..", "..", "resources", "ffmpeg");

  ensureDir(userDataDir);
  ensureDir(tempDir);

  return {
    userDataDir,
    tempDir,
    dbPath,
    ffmpegResourceDir,
    appName: "actc-live"
  };
};
