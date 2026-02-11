import type { SessionState, StreamLifecycleState } from "./types.js";

const transitions: Record<SessionState, SessionState[]> = {
  idle: ["preparing-clip", "failed"],
  "preparing-clip": ["provisioning-youtube", "failed"],
  "provisioning-youtube": ["starting-ffmpeg", "failed"],
  "starting-ffmpeg": ["testing", "failed"],
  testing: ["live", "stopping", "failed"],
  live: ["stopping", "failed"],
  stopping: ["completed", "failed"],
  completed: [],
  failed: []
};

export const canTransitionSession = (from: SessionState, to: SessionState): boolean => {
  return transitions[from].includes(to);
};

const streamTransitions: Record<StreamLifecycleState, StreamLifecycleState[]> = {
  ready: ["testing", "live", "complete"],
  testing: ["live", "complete"],
  live: ["complete"],
  complete: []
};

export const canTransitionStream = (
  from: StreamLifecycleState,
  to: StreamLifecycleState
): boolean => {
  return streamTransitions[from].includes(to);
};
