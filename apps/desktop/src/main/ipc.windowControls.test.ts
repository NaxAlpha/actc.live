import type { BrowserWindow } from "electron";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
    ipcRemoveHandler: vi.fn(),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] }))
  };
});

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: mocks.showOpenDialog
  },
  ipcMain: {
    handle: mocks.ipcHandle,
    removeHandler: mocks.ipcRemoveHandler
  }
}));

import { IPC_CHANNELS } from "./ipcChannels.js";
import { registerIpcHandlers } from "./ipc.js";

const buildContext = () =>
  ({
    appSettingsService: {
      getOAuthSetupStatus: vi.fn(),
      setOAuthCredentials: vi.fn(),
      clearOAuthCredentials: vi.fn()
    },
    profileService: {
      listProfiles: vi.fn(),
      removeProfile: vi.fn()
    },
    oauthService: {
      signIn: vi.fn()
    },
    youtubeService: {
      listReusableBroadcasts: vi.fn(),
      createDraftBroadcast: vi.fn()
    },
    sessionService: {
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(),
      subscribeEvents: vi.fn(() => () => {})
    }
  }) as never;

const buildWindow = (): BrowserWindow => {
  let maximized = false;

  const window = {
    minimize: vi.fn(),
    maximize: vi.fn(() => {
      maximized = true;
    }),
    unmaximize: vi.fn(() => {
      maximized = false;
    }),
    close: vi.fn(),
    isMaximized: vi.fn(() => maximized),
    isDestroyed: vi.fn(() => false),
    isFullScreenable: vi.fn(() => false),
    webContents: {
      send: vi.fn()
    }
  };

  return window as unknown as BrowserWindow;
};

describe("window IPC handlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
  });

  it("invokes BrowserWindow control methods once", async () => {
    const mainWindow = buildWindow();
    registerIpcHandlers(buildContext(), mainWindow);

    const minimize = mocks.handlers.get(IPC_CHANNELS.WINDOW_MINIMIZE);
    const toggle = mocks.handlers.get(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE);
    const close = mocks.handlers.get(IPC_CHANNELS.WINDOW_CLOSE);

    expect(minimize).toBeTruthy();
    expect(toggle).toBeTruthy();
    expect(close).toBeTruthy();

    await minimize?.({} as never);
    await toggle?.({} as never);
    await close?.({} as never);

    expect(mainWindow.minimize).toHaveBeenCalledTimes(1);
    expect(mainWindow.maximize).toHaveBeenCalledTimes(1);
    expect(mainWindow.close).toHaveBeenCalledTimes(1);
  });

  it("reports and toggles maximize state", async () => {
    const mainWindow = buildWindow();
    registerIpcHandlers(buildContext(), mainWindow);

    const getState = mocks.handlers.get(IPC_CHANNELS.WINDOW_GET_STATE);
    const toggle = mocks.handlers.get(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE);

    expect(getState).toBeTruthy();
    expect(toggle).toBeTruthy();

    const initial = (await getState?.({} as never)) as {
      maximized: boolean;
      fullscreenable: boolean;
      transparencyEnabled: boolean;
    };
    expect(initial).toEqual({ maximized: false, fullscreenable: false, transparencyEnabled: true });

    const toggled = (await toggle?.({} as never)) as { maximized: boolean };
    expect(toggled).toEqual({ maximized: true });

    const after = (await getState?.({} as never)) as {
      maximized: boolean;
      fullscreenable: boolean;
      transparencyEnabled: boolean;
    };
    expect(after).toEqual({ maximized: true, fullscreenable: false, transparencyEnabled: true });
  });
});
