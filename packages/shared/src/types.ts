export type StopStrategy = "earliest-wins";

export type StopConditions = {
  maxRepeats?: number | undefined;
  maxDurationSec?: number | undefined;
  endAtIsoUtc?: string | undefined;
  strategy: StopStrategy;
};

export type TrimWindow = {
  startSec: number;
  endSec: number;
};

export type BroadcastMode = "create-new" | "reuse-existing";

export type NewBroadcastInput = {
  title: string;
  description?: string | undefined;
  privacyStatus: "private" | "unlisted" | "public";
  scheduledStartIsoUtc: string;
  latencyPreference: "low";
};

export type SessionConfig = {
  profileId: string;
  videoPath: string;
  trim: TrimWindow;
  stop: StopConditions;
  broadcastMode: BroadcastMode;
  existingBroadcastId?: string | undefined;
  newBroadcast?: NewBroadcastInput | undefined;
};

export type SessionState =
  | "idle"
  | "preparing-clip"
  | "provisioning-youtube"
  | "starting-ffmpeg"
  | "testing"
  | "live"
  | "stopping"
  | "completed"
  | "failed";

export type SessionEventLevel = "info" | "warn" | "error";

export type SessionEvent = {
  id: string;
  sessionId: string;
  ts: string;
  level: SessionEventLevel;
  code: string;
  message: string;
};

export type Profile = {
  id: string;
  label: string;
  channelId: string;
  channelTitle: string;
  createdAt: string;
  updatedAt: string;
};

export type ReusableBroadcast = {
  id: string;
  title: string;
  scheduledStartIsoUtc: string;
  privacyStatus: "private" | "unlisted" | "public";
};

export type YoutubeProvisionResult = {
  broadcastId: string;
  streamId: string;
  ingestionAddress: string;
  streamName: string;
};

export type SessionSummary = {
  id: string;
  state: SessionState;
  startedAt: string;
  endedAt?: string | undefined;
  broadcastId?: string | undefined;
  streamId?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

export type StartSessionResult = {
  sessionId: string;
  effectiveDurationSec: number;
  stopAtIsoUtc: string;
};

export type EffectiveDurationInput = {
  clipDurationSec: number;
  stop: StopConditions;
  nowUtcMs?: number;
};

export type EffectiveDurationComputation = {
  effectiveDurationSec: number;
  candidates: Array<{ reason: "repeats" | "maxDuration" | "endAt"; durationSec: number }>;
};

export type StreamLifecycleState = "ready" | "testing" | "live" | "complete";
