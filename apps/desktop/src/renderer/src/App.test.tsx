/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@actc/shared";

import type { DesktopApi } from "../../preload/index.js";
import { App } from "./App.js";

type DesktopApiMocks = {
  sessionStart: ReturnType<typeof vi.fn>;
};

const profileFixture: Profile = {
  id: "profile-1",
  label: "Main",
  channelId: "channel-1",
  channelTitle: "My Channel",
  createdAt: "2026-02-11T19:00:00.000Z",
  updatedAt: "2026-02-11T19:00:00.000Z"
};

const installDesktopApi = (input?: {
  oauthConfigured?: boolean;
  profiles?: Profile[];
  signInShouldFail?: boolean;
}): DesktopApiMocks => {
  const sessionStart = vi.fn(async () => ({
    sessionId: "session-1",
    effectiveDurationSec: 180,
    stopAtIsoUtc: "2026-02-11T20:00:00.000Z"
  }));

  const desktopApi: DesktopApi = {
    settings: {
      getOAuthSetup: vi.fn(async () => ({
        configured: input?.oauthConfigured ?? false,
        source: (input?.oauthConfigured ? "saved" : "none") as "saved" | "none",
        clientIdHint: input?.oauthConfigured ? "123456...abcd" : undefined
      })),
      saveOAuthSetup: vi.fn(async () => ({
        configured: true,
        source: "saved" as const,
        clientIdHint: "123456...abcd"
      })),
      clearOAuthSetup: vi.fn(async () => ({
        configured: false,
        source: "none" as const
      }))
    },
    auth: {
      signIn: vi.fn(async () => {
        if (input?.signInShouldFail) {
          throw new Error("Sign-in failed");
        }
        return profileFixture;
      }),
      listProfiles: vi.fn(async () => input?.profiles ?? []),
      removeProfile: vi.fn(async () => ({ success: true }))
    },
    youtube: {
      listReusableBroadcasts: vi.fn(async () => []),
      createDraftBroadcast: vi.fn()
    },
    session: {
      start: sessionStart,
      stop: vi.fn(async () => ({ success: true })),
      getState: vi.fn(async () => ({
        summary: {
          id: "session-1",
          state: "live" as const,
          startedAt: "2026-02-11T19:58:00.000Z"
        },
        events: []
      })),
      subscribeEvents: vi.fn(async () => () => {})
    },
    app: {
      pickVideoFile: vi.fn(async () => "/tmp/clip.mp4")
    },
    window: {
      minimize: vi.fn(async () => {}),
      toggleMaximize: vi.fn(async () => ({ maximized: false })),
      close: vi.fn(async () => {}),
      getState: vi.fn(async () => ({
        maximized: false,
        fullscreenable: false,
        transparencyEnabled: false
      }))
    }
  };

  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: "Win32"
  });

  window.desktopApi = desktopApi;

  return {
    sessionStart
  };
};

describe("App installer wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps Continue disabled on step 1 until credentials and profile are ready", async () => {
    installDesktopApi({
      oauthConfigured: false,
      profiles: []
    });

    render(<App />);

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts session with Ctrl+Enter only after reaching preflight in sequential flow", async () => {
    const mocks = installDesktopApi({
      oauthConfigured: true,
      profiles: [profileFixture]
    });

    render(<App />);

    const continueFromCredentials = await screen.findByRole("button", { name: "Continue" });
    expect((continueFromCredentials as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(continueFromCredentials);

    await screen.findByRole("heading", { name: "Video + Trim" });
    const videoPathInput = await screen.findByPlaceholderText("/path/to/video.mp4");
    fireEvent.change(videoPathInput, {
      target: {
        value: "/tmp/clip.mp4"
      }
    });

    const continueFromMedia = await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(continueFromMedia);

    await screen.findByRole("heading", { name: "Broadcast Mode" });
    const continueFromBroadcast = await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(continueFromBroadcast);

    await screen.findByRole("heading", { name: "Preflight Checklist" });
    fireEvent.keyDown(window, {
      key: "Enter",
      ctrlKey: true
    });

    await waitFor(() => {
      expect(mocks.sessionStart).toHaveBeenCalledTimes(1);
    });
  });

  it("removes manual close/minimize/maximize UI controls", async () => {
    installDesktopApi({
      oauthConfigured: true,
      profiles: [profileFixture]
    });

    render(<App />);

    expect(await screen.findByText("ACTC Live Setup")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open settings/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Minimize window/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Maximize window/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close window/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings Required" })).toBeNull();
  });

  it("shows dismissible error toasts without taking footer actions away", async () => {
    installDesktopApi({
      oauthConfigured: true,
      profiles: [],
      signInShouldFail: true
    });

    render(<App />);

    const signInButton = await screen.findByRole("button", { name: "Add Channel" });
    fireEvent.click(signInButton);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();

    const dismissButton = screen.getByRole("button", { name: /Dismiss error/i });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
