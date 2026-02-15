import { EventEmitter } from "node:events";

import type { SessionConfig, SessionEvent, SessionSummary } from "@actc/shared";
import { describe, expect, it } from "vitest";

import { SessionService } from "./sessionService.js";

class FakeRepository {
  private readonly sessions = new Map<string, SessionSummary>();
  private readonly events = new Map<string, SessionEvent[]>();

  createSession(_profileId: string, _config: SessionConfig): SessionSummary {
    const id = `session-${Math.random().toString(36).slice(2)}`;
    const summary: SessionSummary = {
      id,
      state: "idle",
      startedAt: new Date().toISOString()
    };

    this.sessions.set(id, summary);
    this.events.set(id, []);
    return summary;
  }

  updateSessionState(sessionId: string, state: SessionSummary["state"]): void {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return;
    }

    this.sessions.set(sessionId, { ...current, state });
  }

  attachYoutubeResources(sessionId: string, broadcastId: string, streamId: string): void {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return;
    }

    this.sessions.set(sessionId, { ...current, broadcastId, streamId });
  }

  completeSession(sessionId: string): void {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return;
    }

    this.sessions.set(sessionId, {
      ...current,
      state: "completed",
      endedAt: new Date().toISOString()
    });
  }

  failSession(sessionId: string, errorCode: string, errorMessage: string): void {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return;
    }

    this.sessions.set(sessionId, {
      ...current,
      state: "failed",
      endedAt: new Date().toISOString(),
      errorCode,
      errorMessage
    });
  }

  addEvent(sessionId: string, level: SessionEvent["level"], code: string, message: string): SessionEvent {
    const event: SessionEvent = {
      id: `event-${Math.random().toString(36).slice(2)}`,
      sessionId,
      ts: new Date().toISOString(),
      level,
      code,
      message
    };

    const list = this.events.get(sessionId) ?? [];
    list.push(event);
    this.events.set(sessionId, list);
    return event;
  }

  getSessionSummary(sessionId: string): SessionSummary | null {
    return this.sessions.get(sessionId) ?? null;
  }

  listSessionEvents(sessionId: string): SessionEvent[] {
    return this.events.get(sessionId) ?? [];
  }
}

class FakeFfmpegService {
  async trimClip(): Promise<void> {
    return;
  }

  async probeDurationSeconds(): Promise<number> {
    return 4;
  }

  startLoopStream(_input: {
    clipPath: string;
    ingestUrl: string;
    durationSec: number;
    onLog: (line: string) => void;
    onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  }): EventEmitter & { killed: boolean; kill: (signal?: NodeJS.Signals) => void } {
    const emitter = new EventEmitter() as EventEmitter & {
      killed: boolean;
      kill: (signal?: NodeJS.Signals) => void;
    };

    emitter.killed = false;
    emitter.kill = () => {
      emitter.killed = true;
      setTimeout(() => {
        emitter.emit("close", 0, null);
      }, 10);
    };

    return emitter;
  }
}

class FakeYoutubeService {
  async provisionForSession(): Promise<{ broadcastId: string; streamId: string; ingestionAddress: string; streamName: string }> {
    return {
      broadcastId: "broadcast-1",
      streamId: "stream-1",
      ingestionAddress: "rtmps://a.rtmp.youtube.com/live2",
      streamName: "key"
    };
  }

  async progressBroadcastLifecycle(): Promise<{
    streamState: "ready" | "testing" | "live" | "complete";
    attemptedTesting: boolean;
    attemptedLive: boolean;
  }> {
    return {
      streamState: "ready",
      attemptedTesting: false,
      attemptedLive: false
    };
  }

  async transitionToComplete(): Promise<void> {
    return;
  }
}

describe("SessionService integration", () => {
  it("starts and allows manual stop", async () => {
    const repo = new FakeRepository();

    const service = new SessionService(
      repo as never,
      new FakeFfmpegService() as never,
      new FakeYoutubeService() as never,
      process.cwd()
    );

    const result = await service.start({
      profileId: "profile-1",
      videoPath: "/tmp/video.mp4",
      trim: { startSec: 0, endSec: 10 },
      stop: {
        maxDurationSec: 300,
        strategy: "earliest-wins"
      },
      broadcastMode: "create-new",
      newBroadcast: {
        title: "Integration Test",
        privacyStatus: "unlisted",
        scheduledStartIsoUtc: new Date(Date.now() + 30_000).toISOString(),
        latencyPreference: "low"
      }
    });

    expect(result.sessionId).toBeTruthy();
    const stopped = await service.stop(result.sessionId);
    expect(stopped).toBe(true);

    const state = service.getState(result.sessionId);
    expect(state.summary?.state).toBe("completed");
  });
});
