import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const platform = process.platform;
const arch = process.arch;
const rootDir = new URL("..", import.meta.url).pathname;
const targetDir = path.join(rootDir, "resources", "ffmpeg", `${platform}-${arch}`);

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const ffmpegTargetName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const ffprobeTargetName = platform === "win32" ? "ffprobe.exe" : "ffprobe";

fs.copyFileSync(ffmpegInstaller.path, path.join(targetDir, ffmpegTargetName));
fs.copyFileSync(ffprobeInstaller.path, path.join(targetDir, ffprobeTargetName));

const licensePath = path.join(rootDir, "resources", "licenses", "FFMPEG_LICENSE.txt");
const licenseContent = [
  "FFmpeg binaries are redistributed for internal testing.",
  "See https://ffmpeg.org/legal.html for license and compliance requirements.",
  "The binary source package can be obtained from the upstream installer packages:",
  "- @ffmpeg-installer/ffmpeg",
  "- @ffprobe-installer/ffprobe"
].join("\n");

fs.mkdirSync(path.dirname(licensePath), { recursive: true });
fs.writeFileSync(licensePath, `${licenseContent}\n`, "utf8");

console.log(`Prepared FFmpeg assets at ${targetDir}`);
