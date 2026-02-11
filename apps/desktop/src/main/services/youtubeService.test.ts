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
          trim: {
            startSec: 0,
            endSec: 5
          },
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
});
