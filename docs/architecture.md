# ACTC Live v1 Architecture

## Runtime topology
- Renderer: React app for profile setup, stream configuration, and session monitoring.
- Main: Electron process for OAuth, YouTube API orchestration, SQLite persistence, FFmpeg control, and secure secret storage.
- Preload: strict IPC bridge exposing only approved methods.

## Core flow
1. User authenticates channel profile via OAuth (`auth.signIn`).
2. User configures stream session: local video + trim + stop conditions + broadcast mode.
3. Main process validates config, trims source video, probes duration, computes earliest stop deadline.
4. YouTube provisioning creates/attaches broadcast and stream, then returns ingest destination.
5. FFmpeg loops trimmed clip to YouTube RTMP ingest until earliest stop condition is reached.
6. Session service transitions stream to complete, persists summary/events, and cleans up temporary files.

## Security model
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- OAuth tokens stored in OS keychain via `keytar` when available.
- Fallback file secret store is present for environments without keychain support.
- Stream keys/access tokens are redacted from logs.

## Data model
SQLite tables:
- `profiles`
- `profile_secrets`
- `sessions`
- `session_events`

## Packaging
- Electron Builder targets:
  - macOS: unsigned `zip`
  - Windows: portable executable
- FFmpeg/ffprobe binaries copied to app resources via `apps/desktop/scripts/prepare-ffmpeg-assets.mjs`.
