import { describe, expect, it, vi, beforeEach } from "vitest";

import { YoutubeService } from "./youtubeService.js";

const mocks = vi.hoisted(() => ({
  youtubeFactory: vi.fn(),
  listBroadcasts: vi.fn(),
  insertBroadcast: vi.fn(),
  bindBroadcast: vi.fn(),
  transitionBroadcast: vi.fn(),
  insertStream: vi.fn(),
  listStreams: vi.fn()
}));

vi.mock("googleapis", () => ({
  google: {
    youtube: mocks.youtubeFactory
  }
}));

const createApiError = (message: string, reasons: string[] = []): Error & { response: unknown } => {
  const error = new Error(message) as Error & { response: unknown };
  error.response = {
    data: {
      error: {
        message,
        errors: reasons.map((reason) => ({ reason }))
      }
    }
  };
  return error;
};

describe("YoutubeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.youtubeFactory.mockReturnValue({
      liveBroadcasts: {
        list: mocks.listBroadcasts,
        insert: mocks.insertBroadcast,
        bind: mocks.bindBroadcast,
        transition: mocks.transitionBroadcast
      },
      liveStreams: {
        insert: mocks.insertStream,
        list: mocks.listStreams
      }
    });
  });

  it("retries listReusableBroadcasts when mine+broadcastStatus is rejected", async () => {
    mocks.listBroadcasts
      .mockRejectedValueOnce(
        createApiError("Incompatible parameters specified in the request: mine, broadcastStatus")
      )
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "keep-1",
              snippet: {
                title: "Upcoming Show",
                scheduledStartTime: "2026-02-11T20:00:00.000Z"
              },
              status: {
                privacyStatus: "unlisted",
                lifeCycleStatus: "ready"
              }
            },
            {
              id: "drop-1",
              snippet: {
                title: "Completed Show",
                scheduledStartTime: "2025-01-01T00:00:00.000Z"
              },
              status: {
                privacyStatus: "private",
                lifeCycleStatus: "complete"
              }
            }
          ]
        }
      });

    const service = new YoutubeService({
      buildOAuthClientForProfile: vi.fn().mockResolvedValue({})
    } as never);

    const result = await service.listReusableBroadcasts("profile-1");

    expect(mocks.listBroadcasts).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        id: "keep-1",
        title: "Upcoming Show",
        scheduledStartIsoUtc: "2026-02-11T20:00:00.000Z",
        privacyStatus: "unlisted"
      }
    ]);
  });

  it("maps live-streaming eligibility API errors to actionable guidance", async () => {
    mocks.insertStream.mockRejectedValueOnce(
      createApiError("The user is not enabled for live streaming.", ["liveStreamingNotEnabled"])
    );

    const service = new YoutubeService({
      buildOAuthClientForProfile: vi.fn().mockResolvedValue({})
    } as never);

    await expect(
      service.provisionForSession({
        profileId: "profile-1",
        config: {
          profileId: "profile-1",
          videoPath: "/tmp/video.mp4",
          stop: {
            strategy: "earliest-wins",
            maxRepeats: 1
          },
          broadcastMode: "reuse-existing",
          existingBroadcastId: "broadcast-1"
        }
      })
    ).rejects.toThrow(
      "This channel is not currently eligible to go live via API. In YouTube Studio, verify Live is enabled, phone verification is complete, no active live restrictions exist, and if recently enabled wait up to 24 hours."
    );
  });

  it("retries createDraftBroadcast without contentDetails when YouTube rejects content settings", async () => {
    mocks.insertBroadcast
      .mockRejectedValueOnce(createApiError("'content_details'"))
      .mockResolvedValueOnce({
        data: {
          id: "broadcast-1",
          snippet: {
            title: "Fallback Broadcast",
            scheduledStartTime: "2026-02-11T21:00:00.000Z"
          },
          status: {
            privacyStatus: "unlisted"
          }
        }
      });

    const service = new YoutubeService({
      buildOAuthClientForProfile: vi.fn().mockResolvedValue({})
    } as never);

    const result = await service.createDraftBroadcast("profile-1", {
      title: "Fallback Broadcast",
      privacyStatus: "unlisted",
      scheduledStartIsoUtc: "2026-02-11T21:00:00.000Z",
      latencyPreference: "low"
    });

    expect(result.id).toBe("broadcast-1");
    expect(mocks.insertBroadcast).toHaveBeenCalledTimes(2);
    expect(mocks.insertBroadcast.mock.calls[0]?.[0].requestBody.contentDetails).toEqual({
      latencyPreference: "low"
    });
    expect(mocks.insertBroadcast.mock.calls[1]?.[0].part).toEqual(["id", "snippet", "status"]);
    expect(mocks.insertBroadcast.mock.calls[1]?.[0].requestBody.contentDetails).toBeUndefined();
  });

  it("retries stream insert without contentDetails when YouTube rejects content settings", async () => {
    mocks.insertStream
      .mockRejectedValueOnce(createApiError("'content_details'"))
      .mockResolvedValueOnce({
        data: {
          id: "stream-1",
          cdn: {
            ingestionInfo: {
              ingestionAddress: "rtmps://a.rtmp.youtube.com/live2",
              streamName: "stream-key"
            }
          }
        }
      });
    mocks.bindBroadcast.mockResolvedValueOnce({ data: {} });

    const service = new YoutubeService({
      buildOAuthClientForProfile: vi.fn().mockResolvedValue({})
    } as never);

    const result = await service.provisionForSession({
      profileId: "profile-1",
      config: {
        profileId: "profile-1",
        videoPath: "/tmp/video.mp4",
        stop: {
          strategy: "earliest-wins",
          maxRepeats: 1
        },
        broadcastMode: "reuse-existing",
        existingBroadcastId: "broadcast-1"
      }
    });

    expect(result.streamId).toBe("stream-1");
    expect(mocks.insertStream).toHaveBeenCalledTimes(2);
    expect(mocks.insertStream.mock.calls[0]?.[0].requestBody.contentDetails).toEqual({
      isReusable: false
    });
    expect(mocks.insertStream.mock.calls[1]?.[0].part).toEqual(["id", "cdn", "status", "snippet"]);
    expect(mocks.insertStream.mock.calls[1]?.[0].requestBody.contentDetails).toBeUndefined();
  });

  it("only attempts testing transition while ingest is ready", async () => {
    mocks.listStreams.mockResolvedValue({
      data: {
        items: [
          {
            id: "stream-1",
            status: {
              streamStatus: "ready"
            }
          }
        ]
      }
    });

    const service = new YoutubeService({
      buildOAuthClientForProfile: vi.fn().mockResolvedValue({})
    } as never);

    const result = await service.progressBroadcastLifecycle("profile-1", "broadcast-1", "stream-1");

    expect(result).toEqual({
      streamState: "ready",
      attemptedTesting: true,
      attemptedLive: false
    });
    expect(mocks.transitionBroadcast).toHaveBeenCalledTimes(1);
    expect(mocks.transitionBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastStatus: "testing"
      })
    );
  });

  it("attempts live transition only after ingest is active", async () => {
    mocks.listStreams.mockResolvedValue({
      data: {
        items: [
          {
            id: "stream-1",
            status: {
              streamStatus: "active"
            }
          }
        ]
      }
    });

    const service = new YoutubeService({
      buildOAuthClientForProfile: vi.fn().mockResolvedValue({})
    } as never);

    const result = await service.progressBroadcastLifecycle("profile-1", "broadcast-1", "stream-1");

    expect(result).toEqual({
      streamState: "live",
      attemptedTesting: false,
      attemptedLive: true
    });
    expect(mocks.transitionBroadcast).toHaveBeenCalledTimes(1);
    expect(mocks.transitionBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastStatus: "live"
      })
    );
  });
});
