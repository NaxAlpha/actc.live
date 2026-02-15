# YouTube API Mapping

## OAuth scopes
- `https://www.googleapis.com/auth/youtube`
- `https://www.googleapis.com/auth/youtube.force-ssl`

## Session lifecycle API calls
1. `liveBroadcasts.insert` (create-new mode only)
2. `liveStreams.insert`
3. `liveBroadcasts.bind`
4. `liveBroadcasts.transition(..., testing)`
5. `liveBroadcasts.transition(..., live)`
6. `liveBroadcasts.transition(..., complete)`

## Reuse mode calls
1. `liveBroadcasts.list` for `upcoming` events
2. `liveStreams.insert`
3. `liveBroadcasts.bind`
4. transitions

## Quota awareness
- `insert`/`bind`/`transition` operations consume high quota units.
- Implementation avoids unnecessary retries and records warning events on transient transition failures.

## Notes
- Ingest URL is derived from `liveStreams.cdn.ingestionInfo`.
