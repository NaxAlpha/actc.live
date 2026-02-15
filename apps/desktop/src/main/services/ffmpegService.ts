import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { redactSensitive } from "@actc/shared";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

export type RuntimeFfmpegPaths = {
  ffmpegResourceDir: string;
};

export type StreamProcessOptions = {
  inputPath: string;
  ingestUrl: string;
  durationSec: number;
  onLog: (line: string) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
};

export const buildLoopStreamArgs = (
  inputPath: string,
  ingestUrl: string,
  durationSec: number
): string[] => {
  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
    "-stream_loop",
    "-1",
    "-i",
    inputPath,
    "-t",
    durationSec.toString(),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-f",
    "flv",
    ingestUrl
  ];
};

export class FfmpegService {
  constructor(private readonly runtimePaths: RuntimeFfmpegPaths) {}

  resolveBinaries(): { ffmpegPath: string; ffprobePath: string } {
    const platformKey = `${process.platform}-${process.arch}`;
    const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const ffprobeName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";

    const packagedFfmpegPath = path.join(
      this.runtimePaths.ffmpegResourceDir,
      platformKey,
      ffmpegName
    );
    const packagedFfprobePath = path.join(
      this.runtimePaths.ffmpegResourceDir,
      platformKey,
      ffprobeName
    );

    const ffmpegPath = fs.existsSync(packagedFfmpegPath) ? packagedFfmpegPath : ffmpegInstaller.path;
    const ffprobePath = fs.existsSync(packagedFfprobePath) ? packagedFfprobePath : ffprobeInstaller.path;

    return { ffmpegPath, ffprobePath };
  }

  async probeDurationSeconds(filePath: string): Promise<number> {
    const { ffprobePath } = this.resolveBinaries();

    return new Promise((resolve, reject) => {
      const child = spawn(ffprobePath, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ]);

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        errorOutput += chunk.toString();
      });

      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed (${code}): ${errorOutput.trim()}`));
          return;
        }

        const parsed = Number.parseFloat(output.trim());
        if (!Number.isFinite(parsed) || parsed <= 0) {
          reject(new Error(`ffprobe returned invalid duration: ${output}`));
          return;
        }

        resolve(parsed);
      });
    });
  }

  startLoopStream(options: StreamProcessOptions): ChildProcess {
    const { ffmpegPath } = this.resolveBinaries();
    const args = buildLoopStreamArgs(options.inputPath, options.ingestUrl, options.durationSec);

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      options.onLog(redactSensitive(chunk.toString()));
    });

    child.stderr.on("data", (chunk) => {
      options.onLog(redactSensitive(chunk.toString()));
    });

    child.once("close", (code, signal) => {
      options.onExit(code, signal);
    });

    child.once("error", (error) => {
      options.onLog(`ffmpeg process error: ${error.message}`);
    });

    return child;
  }
}
