# actc.live

Cross-platform Electron desktop app for looping a local video into YouTube Live with earliest-stop repeat controls.

## Project structure
- `/Users/nax/Documents/actc.live/apps/desktop`: Electron app (main, preload, renderer)
- `/Users/nax/Documents/actc.live/packages/shared`: shared types, validators, stop-condition logic
- `/Users/nax/Documents/actc.live/docs`: architecture and test runbooks
- `/Users/nax/Documents/actc.live/.github/workflows`: CI pipelines

## OAuth credentials setup
You now have two ways to configure OAuth credentials:

1. Recommended: set credentials in-app on first launch (`0. API Credentials` panel / setup dialog).
2. Optional fallback: set environment variables before launch.

```bash
export YT_OAUTH_CLIENT_ID="your-google-oauth-client-id"
export YT_OAUTH_CLIENT_SECRET="your-google-oauth-client-secret"
```

In-app setup instructions:
1. Open Google Cloud Console and enable YouTube Data API v3.
2. Create OAuth credentials with application type `Desktop App`.
3. Paste Client ID and Client Secret into the app setup dialog.
4. Save, then use `OAuth Sign-In` in the app.

## Install
```bash
npm ci
```

## Run in development
```bash
npm run dev -w @actc/desktop
```

## Validate locally
```bash
npm run lint
npm run typecheck
npm run test
```

## Build and package portable artifacts
```bash
npm run package:desktop
```

Artifacts are produced in `/Users/nax/Documents/actc.live/apps/desktop/release`.

## Implemented v1 capabilities
- OAuth sign-in and multi-profile channel management
- Create-new or reuse-existing YouTube broadcast flows
- Local video selection
- Stop conditions: max repeats, max duration, and absolute end time (earliest wins)
- Session orchestration with event logs and persisted summaries
- FFmpeg/ffprobe resource preparation for packaged app
- GitHub CI workflows for quality checks, packaging, and optional E2E smoke

## Live credential test status
Credentialed end-to-end live tests are not executed yet and require your real OAuth credentials/channel access.
