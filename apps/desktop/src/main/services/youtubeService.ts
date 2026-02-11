import { randomUUID } from "node:crypto";

import type {
  NewBroadcastInput,
  ReusableBroadcast,
  SessionConfig,
  YoutubeProvisionResult
} from "@actc/shared";
import { canTransitionStream } from "@actc/shared";
import { google, type youtube_v3 } from "googleapis";

import type { OauthService } from "./oauthService.js";

const LIVE_STREAM_PART = ["id", "cdn", "status", "snippet"] as const;
const LIVE_BROADCAST_PART = ["id", "snippet", "status", "contentDetails"] as const;

export type BroadcastProvisionInput = {
  profileId: string;
  config: SessionConfig;
};

export class YoutubeService {
  constructor(private readonly oauthService: OauthService) {}

  async listReusableBroadcasts(profileId: string): Promise<ReusableBroadcast[]> {
    const youtube = await this.getYoutubeClient(profileId);
    const requests: youtube_v3.Params$Resource$Livebroadcasts$List[] = [
      {
        part: [...LIVE_BROADCAST_PART],
        mine: true,
        maxResults: 25,
        broadcastStatus: "upcoming",
        broadcastType: "all"
      },
      {
        part: [...LIVE_BROADCAST_PART],
        mine: true,
        maxResults: 25,
        broadcastStatus: "upcoming"
      },
      {
        part: [...LIVE_BROADCAST_PART],
        maxResults: 25,
        broadcastStatus: "upcoming",
        broadcastType: "all"
      },
      {
        part: [...LIVE_BROADCAST_PART],
        mine: true,
        maxResults: 25
      }
    ];

    let lastError: unknown;
    for (const request of requests) {
      try {
        const response = await youtube.liveBroadcasts.list(request);
        return this.mapReusableBroadcasts(response.data.items ?? []);
      } catch (error) {
        const message = this.errorMessage(error);
        if (message.includes("Incompatible parameters specified in the request")) {
          lastError = error;
          continue;
        }

        throw this.normalizeYoutubeError(error);
      }
    }

    throw this.normalizeYoutubeError(lastError);
  }

  async createDraftBroadcast(profileId: string, payload: NewBroadcastInput): Promise<ReusableBroadcast> {
    const youtube = await this.getYoutubeClient(profileId);

    try {
      const response = await youtube.liveBroadcasts.insert({
        part: [...LIVE_BROADCAST_PART],
        requestBody: {
          snippet: {
            title: payload.title,
            description: payload.description ?? null,
            scheduledStartTime: payload.scheduledStartIsoUtc
          },
          status: {
            privacyStatus: payload.privacyStatus,
            selfDeclaredMadeForKids: false
          },
          contentDetails: {
            latencyPreference: payload.latencyPreference,
            enableAutoStart: false,
            enableAutoStop: false
          }
        }
      });

      const created = response.data;

      if (!created.id || !created.snippet?.title || !created.snippet.scheduledStartTime) {
        throw new Error("YouTube API returned an invalid broadcast response");
      }

      return {
        id: created.id,
        title: created.snippet.title,
        scheduledStartIsoUtc: created.snippet.scheduledStartTime,
        privacyStatus: (created.status?.privacyStatus ?? payload.privacyStatus) as
          | "private"
          | "unlisted"
          | "public"
      };
    } catch (error) {
      throw this.normalizeYoutubeError(error);
    }
  }

  async provisionForSession(input: BroadcastProvisionInput): Promise<YoutubeProvisionResult> {
    try {
      const youtube = await this.getYoutubeClient(input.profileId);

      let broadcastId: string;

      if (input.config.broadcastMode === "create-new") {
        if (!input.config.newBroadcast) {
          throw new Error("Missing newBroadcast payload for create-new mode");
        }

        const draft = await this.createDraftBroadcast(input.profileId, input.config.newBroadcast);
        broadcastId = draft.id;
      } else {
        if (!input.config.existingBroadcastId) {
          throw new Error("Missing existingBroadcastId for reuse-existing mode");
        }

        broadcastId = input.config.existingBroadcastId;
      }

      const streamName = `actc-${randomUUID().slice(0, 12)}`;
      const streamInsert = await youtube.liveStreams.insert({
        part: [...LIVE_STREAM_PART],
        requestBody: {
          snippet: {
            title: `ACTC Stream ${new Date().toISOString()}`
          },
          cdn: {
            frameRate: "30fps",
            ingestionType: "rtmp",
            resolution: "1080p"
          },
          contentDetails: {
            isReusable: false
          }
        }
      });

      const stream = streamInsert.data;

      if (!stream.id || !stream.cdn?.ingestionInfo?.ingestionAddress || !stream.cdn.ingestionInfo.streamName) {
        throw new Error("YouTube API returned an invalid stream ingestion payload");
      }

      await youtube.liveBroadcasts.bind({
        id: broadcastId,
        part: [...LIVE_BROADCAST_PART],
        streamId: stream.id
      });

      return {
        broadcastId,
        streamId: stream.id,
        ingestionAddress: stream.cdn.ingestionInfo.ingestionAddress,
        streamName: stream.cdn.ingestionInfo.streamName ?? streamName
      };
    } catch (error) {
      throw this.normalizeYoutubeError(error);
    }
  }

  async transitionToTesting(profileId: string, broadcastId: string): Promise<void> {
    await this.transitionBroadcast(profileId, broadcastId, "testing");
  }

  async transitionToLive(profileId: string, broadcastId: string): Promise<void> {
    await this.transitionBroadcast(profileId, broadcastId, "live");
  }

  async transitionToComplete(profileId: string, broadcastId: string): Promise<void> {
    await this.transitionBroadcast(profileId, broadcastId, "complete");
  }

  async pollStreamState(
    profileId: string,
    streamId: string
  ): Promise<"ready" | "testing" | "live" | "complete"> {
    const youtube = await this.getYoutubeClient(profileId);
    const response = await youtube.liveStreams.list({
      id: [streamId],
      part: ["status", "id"]
    });

    const item = response.data.items?.[0];
    const status = item?.status?.streamStatus;

    if (status === "active") {
      return "live";
    }

    if (status === "ready") {
      return "ready";
    }

    return "testing";
  }

  async progressBroadcastLifecycle(profileId: string, broadcastId: string, streamId: string): Promise<void> {
    const streamState = await this.pollStreamState(profileId, streamId);

    if (canTransitionStream(streamState, "testing")) {
      try {
        await this.transitionToTesting(profileId, broadcastId);
      } catch (_error) {
        // YouTube may reject testing transition if broadcast is already in test/live state.
      }
    }

    const nextState = await this.pollStreamState(profileId, streamId);

    if (canTransitionStream(nextState, "live")) {
      try {
        await this.transitionToLive(profileId, broadcastId);
      } catch (_error) {
        // Transitions may race with YouTube's internal ingest readiness.
      }
    }
  }

  private async transitionBroadcast(
    profileId: string,
    broadcastId: string,
    status: "testing" | "live" | "complete"
  ): Promise<void> {
    const youtube = await this.getYoutubeClient(profileId);

    try {
      await youtube.liveBroadcasts.transition({
        part: ["status", "id"],
        id: broadcastId,
        broadcastStatus: status
      });
    } catch (error) {
      throw this.normalizeYoutubeError(error);
    }
  }

  private async getYoutubeClient(profileId: string): Promise<ReturnType<typeof google.youtube>> {
    const oauthClient = await this.oauthService.buildOAuthClientForProfile(profileId);
    return google.youtube({ version: "v3", auth: oauthClient });
  }

  private mapReusableBroadcasts(
    items: Array<{
      id?: string | null;
      snippet?: { title?: string | null; scheduledStartTime?: string | null } | null;
      status?: { privacyStatus?: string | null; lifeCycleStatus?: string | null } | null;
    }>
  ): ReusableBroadcast[] {
    return items
      .filter((item) => {
        if (!item.id || !item.snippet?.title) {
          return false;
        }

        const lifecycle = (item.status?.lifeCycleStatus ?? "").toLowerCase();
        return lifecycle !== "complete" && lifecycle !== "revoked";
      })
      .map((item) => ({
        id: item.id as string,
        title: item.snippet?.title as string,
        scheduledStartIsoUtc:
          item.snippet?.scheduledStartTime ?? new Date(Date.now() + 60_000).toISOString(),
        privacyStatus: (item.status?.privacyStatus ?? "unlisted") as "private" | "unlisted" | "public"
      }));
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error ?? "Unknown YouTube API error");
  }

  private normalizeYoutubeError(error: unknown): Error {
    const details = this.extractApiErrorDetails(error);
    const combined = [details.message, ...details.reasons].join(" ").toLowerCase();

    if (
      combined.includes("the user is not enabled for live streaming") ||
      details.reasons.includes("livestreamingnotenabled")
    ) {
      return new Error(
        "This channel is not currently eligible to go live via API. In YouTube Studio, verify Live is enabled, phone verification is complete, no active live restrictions exist, and if recently enabled wait up to 24 hours."
      );
    }

    return error instanceof Error ? error : new Error(details.message);
  }

  private extractApiErrorDetails(error: unknown): { message: string; reasons: string[] } {
    const message = this.errorMessage(error);
    const reasons: string[] = [];

    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof (error as { response?: unknown }).response === "object"
    ) {
      const response = (error as { response?: { data?: unknown } }).response;
      const data = response?.data as
        | {
            error?: {
              message?: unknown;
              errors?: Array<{ reason?: unknown }>;
            };
          }
        | undefined;

      const nestedMessage = data?.error?.message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        // Favor explicit API messages when available.
        return {
          message: nestedMessage,
          reasons: (data?.error?.errors ?? [])
            .map((entry) => entry.reason)
            .filter((reason): reason is string => typeof reason === "string")
            .map((reason) => reason.toLowerCase())
        };
      }

      for (const item of data?.error?.errors ?? []) {
        if (typeof item.reason === "string") {
          reasons.push(item.reason.toLowerCase());
        }
      }
    }

    return { message, reasons };
  }
}
