import { randomUUID } from "node:crypto";

import type { SessionConfig, SessionEvent, SessionEventLevel, SessionState, SessionSummary } from "@actc/shared";

import type { DatabaseService } from "./databaseService.js";

type SessionRow = {
  id: string;
  profile_id: string;
  started_at: string;
  ended_at: string | null;
  state: SessionState;
  config_json: string;
  broadcast_id: string | null;
  stream_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

type SessionEventRow = {
  id: string;
  session_id: string;
  ts: string;
  level: SessionEventLevel;
  code: string;
  message: string;
};

export class SessionRepository {
  constructor(private readonly db: DatabaseService) {}

  createSession(profileId: string, config: SessionConfig): SessionSummary {
    const id = randomUUID();
    const startedAt = new Date().toISOString();

    this.db.run(
      "INSERT INTO sessions (id, profile_id, started_at, state, config_json) VALUES (?, ?, ?, ?, ?)",
      [id, profileId, startedAt, "idle", JSON.stringify(config)]
    );

    return {
      id,
      state: "idle",
      startedAt
    };
  }

  updateSessionState(sessionId: string, state: SessionState): void {
    this.db.run("UPDATE sessions SET state = ? WHERE id = ?", [state, sessionId]);
  }

  attachYoutubeResources(sessionId: string, broadcastId: string, streamId: string): void {
    this.db.run(
      "UPDATE sessions SET broadcast_id = ?, stream_id = ? WHERE id = ?",
      [broadcastId, streamId, sessionId]
    );
  }

  completeSession(sessionId: string): void {
    this.db.run("UPDATE sessions SET state = ?, ended_at = ? WHERE id = ?", [
      "completed",
      new Date().toISOString(),
      sessionId
    ]);
  }

  failSession(sessionId: string, code: string, message: string): void {
    this.db.run(
      "UPDATE sessions SET state = ?, ended_at = ?, error_code = ?, error_message = ? WHERE id = ?",
      ["failed", new Date().toISOString(), code, message, sessionId]
    );
  }

  addEvent(
    sessionId: string,
    level: SessionEventLevel,
    code: string,
    message: string
  ): SessionEvent {
    const event: SessionEvent = {
      id: randomUUID(),
      sessionId,
      ts: new Date().toISOString(),
      level,
      code,
      message
    };

    this.db.run(
      "INSERT INTO session_events (id, session_id, ts, level, code, message) VALUES (?, ?, ?, ?, ?, ?)",
      [event.id, event.sessionId, event.ts, event.level, event.code, event.message]
    );

    return event;
  }

  getSessionSummary(sessionId: string): SessionSummary | null {
    const row = this.db.query<SessionRow>(
      "SELECT id, profile_id, started_at, ended_at, state, config_json, broadcast_id, stream_id, error_code, error_message FROM sessions WHERE id = ? LIMIT 1",
      [sessionId]
    )[0];

    if (!row) {
      return null;
    }

    const summary: SessionSummary = {
      id: row.id,
      state: row.state,
      startedAt: row.started_at
    };

    if (row.ended_at) {
      summary.endedAt = row.ended_at;
    }
    if (row.broadcast_id) {
      summary.broadcastId = row.broadcast_id;
    }
    if (row.stream_id) {
      summary.streamId = row.stream_id;
    }
    if (row.error_code) {
      summary.errorCode = row.error_code;
    }
    if (row.error_message) {
      summary.errorMessage = row.error_message;
    }

    return summary;
  }

  listSessionEvents(sessionId: string): SessionEvent[] {
    const rows = this.db.query<SessionEventRow>(
      "SELECT id, session_id, ts, level, code, message FROM session_events WHERE session_id = ? ORDER BY ts ASC",
      [sessionId]
    );

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      ts: row.ts,
      level: row.level,
      code: row.code,
      message: row.message
    }));
  }
}
