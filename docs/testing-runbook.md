# Testing Runbook

## Local prerequisites
- Node 20+
- OAuth credentials:
  - Either configure in app (`API Credentials` setup dialog), or
  - Provide env variables (`YT_OAUTH_CLIENT_ID`, `YT_OAUTH_CLIENT_SECRET`)

## Commands
- Install: `npm ci`
- Unit+integration: `npm run test`
- Typecheck: `npm run typecheck`
- Desktop build: `npm run build -w @actc/desktop`
- Package artifacts: `npm run package:desktop`
- E2E smoke: `npm run e2e -w @actc/desktop`

## Non-credential local smoke
1. Launch app: `npm run dev -w @actc/desktop`
2. Pick local video.
3. Configure stop: `maxRepeats=3`.
4. Validate config form behavior and session event rendering.

## Credentialed live test checklist
1. Sign in to real YouTube channel.
2. Create new unlisted broadcast, run 3-repeat session.
3. Run duration stop override scenario.
4. Run end-time stop scenario.
5. Run reuse-existing scheduled broadcast scenario.
6. Simulate forced interruption and confirm cleanup behavior.
7. Verify broadcast transitioned to complete.
