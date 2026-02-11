import { contextBridge, ipcRenderer } from "electron";

import type {
  NewBroadcastInput,
  Profile,
  ReusableBroadcast,
  SessionConfig,
  SessionEvent,
  SessionSummary,
  StartSessionResult
} from "@actc/shared";

import { IPC_CHANNELS } from "../main/ipcChannels.js";

export type DesktopApi = {
  settings: {
    getOAuthSetup: () => Promise<{
      configured: boolean;
      source: "saved" | "env" | "none";
      clientIdHint?: string | undefined;
    }>;
    saveOAuthSetup: (payload: { clientId: string; clientSecret: string }) => Promise<{
      configured: boolean;
      source: "saved" | "env" | "none";
      clientIdHint?: string | undefined;
    }>;
    clearOAuthSetup: () => Promise<{
      configured: boolean;
      source: "saved" | "env" | "none";
      clientIdHint?: string | undefined;
    }>;
  };
  auth: {
    signIn: (profileLabel: string) => Promise<Profile>;
    listProfiles: () => Promise<Profile[]>;
    removeProfile: (profileId: string) => Promise<{ success: boolean }>;
  };
  youtube: {
    listReusableBroadcasts: (profileId: string) => Promise<ReusableBroadcast[]>;
    createDraftBroadcast: (profileId: string, payload: NewBroadcastInput) => Promise<ReusableBroadcast>;
  };
  session: {
    start: (config: SessionConfig) => Promise<StartSessionResult>;
    stop: (sessionId: string) => Promise<{ success: boolean }>;
    getState: (sessionId: string) => Promise<{
      summary: SessionSummary | null;
      events: SessionEvent[];
    }>;
    subscribeEvents: (
      sessionId: string,
      listener: (event: SessionEvent) => void
    ) => Promise<() => void>;
  };
  app: {
    pickVideoFile: () => Promise<string | null>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<{ maximized: boolean }>;
    close: () => Promise<void>;
    getState: () => Promise<{
      maximized: boolean;
      fullscreenable: boolean;
      transparencyEnabled: boolean;
    }>;
  };
};

const api: DesktopApi = {
  settings: {
    getOAuthSetup: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_OAUTH_SETUP),
    saveOAuthSetup: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE_OAUTH_SETUP, payload),
    clearOAuthSetup: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_OAUTH_SETUP)
  },
  auth: {
    signIn: (profileLabel) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_IN, profileLabel),
    listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LIST_PROFILES),
    removeProfile: (profileId) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_REMOVE_PROFILE, profileId)
  },
  youtube: {
    listReusableBroadcasts: (profileId) =>
      ipcRenderer.invoke(IPC_CHANNELS.YT_LIST_REUSABLE_BROADCASTS, profileId),
    createDraftBroadcast: (profileId, payload) =>
      ipcRenderer.invoke(IPC_CHANNELS.YT_CREATE_DRAFT_BROADCAST, profileId, payload)
  },
  session: {
    start: (config) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, config),
    stop: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP, sessionId),
    getState: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_STATE, sessionId),
    subscribeEvents: async (sessionId, listener) => {
      await ipcRenderer.invoke(IPC_CHANNELS.SESSION_SUBSCRIBE_EVENTS, sessionId);

      const handler = (_event: Electron.IpcRendererEvent, payload: SessionEvent) => {
        if (payload.sessionId === sessionId) {
          listener(payload);
        }
      };

      ipcRenderer.on(IPC_CHANNELS.SESSION_EVENT_STREAM, handler);

      return () => {
        ipcRenderer.off(IPC_CHANNELS.SESSION_EVENT_STREAM, handler);
      };
    }
  },
  app: {
    pickVideoFile: () => ipcRenderer.invoke(IPC_CHANNELS.APP_PICK_VIDEO_FILE)
  },
  window: {
    minimize: async () => {
      await ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE);
    },
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
    close: async () => {
      await ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE);
    },
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE)
  }
};

contextBridge.exposeInMainWorld("desktopApi", api);
