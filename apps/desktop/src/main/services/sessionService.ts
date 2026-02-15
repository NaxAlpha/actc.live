import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import {
  canTransitionSession,
  computeEffectiveDuration,
  sessionConfigSchema,
  type SessionConfig,
  type SessionEvent,
  type SessionSummary,
  type StartSessionResult
} from "@actc/shared";

import type { FfmpegService } from "./ffmpegService.js";
import type { SessionRepository } from "./sessionRepository.js";
import type { YoutubeService } from "./youtubeService.js";

type ActiveSession = {
  id: string;
  profileId: string;
  clipPath: string;
  broadcastId?: string;
  streamId?: string;
  lastObservedStreamState?: "ready" | "testing" | "live" | "complete";
  ffmpegChild?: ReturnType<FfmpegService["startLoopStream"]>;
  stopTimer?: NodeJS.Timeout;
  pollTimer?: NodeJS.Timeout;
  stopping: boolean;
  finalized: boolean;
};

export class SessionService {
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly events = new EventEmitter();

  constructor(
    private readonly repository: SessionRepository,
    private readonly ffmpegService: FfmpegService,
    private readonly youtubeService: YoutubeService,
    private readonly tempDir: string
  ) {}

  async start(configInput: SessionConfig): Promise<StartSessionResult> {
    const parsed = sessionConfigSchema.parse(configInput);
    const summary = this.repository.createSession(parsed.profileId, parsed);
    const sessionId = summary.id;

    try {
      this.transition(sessionId, "preparing-clip");
      this.record(sessionId, "info", "SESSION_START", "Session initialization started");

      const clipPath = path.join(this.tempDir, `${sessionId}-trim.mp4`);
      await this.ffmpegService.trimClip(parsed.videoPath, clipPath, parsed.trim);

      const clipDurationSec = await this.ffmpegService.probeDurationSeconds(clipPath);
      const durationComputation = computeEffectiveDuration({
        clipDurationSec,
        stop: parsed.stop
      });

      const effectiveDurationSec = Math.floor(durationComputation.effectiveDurationSec);
      const stopAtIsoUtc = new Date(Date.now() + effectiveDurationSec * 1000).toISOString();

      this.transition(sessionId, "provisioning-youtube");
      this.record(
        sessionId,
        "info",
        "YOUTUBE_PROVISION_START",
        `Provisioning broadcast for mode ${parsed.broadcastMode}`
      );

      const provisioned = await this.youtubeService.provisionForSession({
        profileId: parsed.profileId,
        config: parsed
      });

      this.repository.attachYoutubeResources(sessionId, provisioned.broadcastId, provisioned.streamId);

      const ingestUrl = `${provisioned.ingestionAddress}/${provisioned.streamName}`;

      this.transition(sessionId, "starting-ffmpeg");
      this.record(sessionId, "info", "FFMPEG_START", "Starting stream process");

      const ffmpegChild = this.ffmpegService.startLoopStream({
        clipPath,
        ingestUrl,
        durationSec: effectiveDurationSec,
        onLog: (line) => {
          if (line.trim()) {
            this.record(sessionId, "info", "FFMPEG_LOG", line.trim());
          }
        },
        onExit: (code, signal) => {
          void this.handleProcessExit(sessionId, code, signal);
        }
      });

      const active: ActiveSession = {
        id: sessionId,
        profileId: parsed.profileId,
        clipPath,
        broadcastId: provisioned.broadcastId,
        streamId: provisioned.streamId,
        ffmpegChild,
        stopping: false,
        finalized: false
      };

      active.stopTimer = setTimeout(() => {
        void this.stop(sessionId, "timer");
      }, effectiveDurationSec * 1000);

      active.pollTimer = setInterval(() => {
        void this.youtubeService
          .progressBroadcastLifecycle(parsed.profileId, provisioned.broadcastId, provisioned.streamId)
          .then((lifecycle) => {
            const current = this.activeSessions.get(sessionId);
            if (!current || current.finalized || current.stopping) {
              return;
            }

            if (current.lastObservedStreamState !== lifecycle.streamState) {
              current.lastObservedStreamState = lifecycle.streamState;
              this.record(
                sessionId,
                "info",
                "YOUTUBE_STREAM_STATE",
                `YouTube ingest state is ${lifecycle.streamState}`
              );
            }

            if (lifecycle.streamState === "live") {
              this.transition(sessionId, "testing");
              this.transition(sessionId, "live");
              return;
            }

            if (lifecycle.attemptedTesting) {
              this.transition(sessionId, "testing");
            }
          })
          .catch((error: Error) => {
            this.record(sessionId, "warn", "YOUTUBE_POLL_WARN", error.message);
          });
      }, 7000);

      this.activeSessions.set(sessionId, active);
      this.record(sessionId, "info", "SESSION_RUNNING", `Session live timer active until ${stopAtIsoUtc}`);

      return {
        sessionId,
        effectiveDurationSec,
        stopAtIsoUtc
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown session start error";
      this.repository.failSession(sessionId, "SESSION_START_FAILED", message);
      this.record(sessionId, "error", "SESSION_START_FAILED", message);
      throw error;
    }
  }

  async stop(sessionId: string, reason: "manual" | "timer" | "process" = "manual"): Promise<boolean> {
    const active = this.activeSessions.get(sessionId);
    if (!active) {
      return false;
    }

    if (active.stopping) {
      return true;
    }

    active.stopping = true;
    this.transition(sessionId, "stopping");
    this.record(sessionId, "info", "SESSION_STOP", `Stop requested (${reason})`);

    if (active.stopTimer) {
      clearTimeout(active.stopTimer);
    }

    if (active.pollTimer) {
      clearInterval(active.pollTimer);
    }

    if (active.ffmpegChild && !active.ffmpegChild.killed) {
      active.ffmpegChild.kill("SIGINT");
      await Promise.race([
        new Promise<void>((resolve) => {
          active.ffmpegChild?.once("close", () => resolve());
        }),
        delay(8_000).then(() => {
          if (active.ffmpegChild && !active.ffmpegChild.killed) {
            active.ffmpegChild.kill("SIGKILL");
          }
        })
      ]);
    }

    if (active.broadcastId) {
      try {
        await this.youtubeService.transitionToComplete(active.profileId, active.broadcastId);
      } catch (error) {
        this.record(
          sessionId,
          "warn",
          "YOUTUBE_COMPLETE_WARN",
          error instanceof Error ? error.message : "Failed to transition to complete"
        );
      }
    }

    this.complete(sessionId);
    return true;
  }

  getState(sessionId: string): { summary: SessionSummary | null; events: SessionEvent[] } {
    const summary = this.repository.getSessionSummary(sessionId);
    const events = this.repository.listSessionEvents(sessionId);

    return { summary, events };
  }

  subscribeEvents(sessionId: string, listener: (event: SessionEvent) => void): () => void {
    const channel = this.eventChannel(sessionId);
    this.events.on(channel, listener);

    return () => {
      this.events.off(channel, listener);
    };
  }

  private async handleProcessExit(
    sessionId: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    const active = this.activeSessions.get(sessionId);
    if (!active || active.finalized) {
      return;
    }

    if (active.stopping) {
      return;
    }

    if (code === 0) {
      this.record(sessionId, "info", "FFMPEG_EXIT", "ffmpeg exited naturally; finalizing session");
      await this.stop(sessionId, "process");
      return;
    }

    const message = `ffmpeg exited unexpectedly (code=${String(code)}, signal=${String(signal)})`;
    this.record(sessionId, "error", "FFMPEG_EXIT_ERROR", message);
    this.fail(sessionId, "FFMPEG_EXIT_ERROR", message);
  }

  private transition(sessionId: string, targetState: SessionSummary["state"]): void {
    const current = this.repository.getSessionSummary(sessionId);
    if (!current) {
      return;
    }

    if (current.state !== targetState && !canTransitionSession(current.state, targetState)) {
      this.record(
        sessionId,
        "warn",
        "INVALID_TRANSITION",
        `Ignoring invalid transition ${current.state} -> ${targetState}`
      );
      return;
    }

    this.repository.updateSessionState(sessionId, targetState);
    this.record(sessionId, "info", "STATE_CHANGE", `Session state changed to ${targetState}`);
  }

  private complete(sessionId: string): void {
    const active = this.activeSessions.get(sessionId);
    if (!active || active.finalized) {
      return;
    }

    active.finalized = true;
    this.cleanupActive(active);
    this.repository.completeSession(sessionId);
    this.record(sessionId, "info", "SESSION_COMPLETED", "Session completed successfully");
  }

  private fail(sessionId: string, code: string, message: string): void {
    const active = this.activeSessions.get(sessionId);
    if (active && !active.finalized) {
      active.finalized = true;
      this.cleanupActive(active);
    }

    this.repository.failSession(sessionId, code, message);
    this.record(sessionId, "error", code, message);
  }

  private cleanupActive(active: ActiveSession): void {
    if (active.stopTimer) {
      clearTimeout(active.stopTimer);
    }

    if (active.pollTimer) {
      clearInterval(active.pollTimer);
    }

    if (fs.existsSync(active.clipPath)) {
      fs.rmSync(active.clipPath, { force: true });
    }

    this.activeSessions.delete(active.id);
  }

  private record(
    sessionId: string,
    level: SessionEvent["level"],
    code: string,
    message: string
  ): SessionEvent {
    const event = this.repository.addEvent(sessionId, level, code, message);
    this.events.emit(this.eventChannel(sessionId), event);
    return event;
  }

  private eventChannel(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
