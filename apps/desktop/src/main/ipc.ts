import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";

import { sessionConfigSchema, newBroadcastSchema, type SessionEvent } from "@actc/shared";

import { IPC_CHANNELS } from "./ipcChannels.js";
import type { AppContext } from "./services/appContext.js";

const serializeError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  return new Error("Unknown IPC error");
};

export const registerIpcHandlers = (context: AppContext, mainWindow: BrowserWindow): (() => void) => {
  const sessionUnsubscribers = new Map<string, () => void>();

  const wrap =
    <TArgs extends unknown[], TResult>(handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult) =>
    async (event: IpcMainInvokeEvent, ...args: TArgs): Promise<TResult> => {
      try {
        return await handler(event, ...args);
      } catch (error) {
        const serialized = serializeError(error);
        throw new Error(serialized.message);
      }
    };

  ipcMain.handle(
    IPC_CHANNELS.AUTH_SIGN_IN,
    wrap(async (_event, profileLabel: string) => {
      return context.oauthService.signIn(profileLabel);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_LIST_PROFILES,
    wrap(async () => {
      return context.profileService.listProfiles();
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_REMOVE_PROFILE,
    wrap(async (_event, profileId: string) => {
      await context.profileService.removeProfile(profileId);
      return { success: true };
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.YT_LIST_REUSABLE_BROADCASTS,
    wrap(async (_event, profileId: string) => {
      return context.youtubeService.listReusableBroadcasts(profileId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.YT_CREATE_DRAFT_BROADCAST,
    wrap(async (_event, profileId: string, payload: unknown) => {
      const parsed = newBroadcastSchema.parse(payload);
      return context.youtubeService.createDraftBroadcast(profileId, parsed);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_START,
    wrap(async (_event, payload: unknown) => {
      const parsed = sessionConfigSchema.parse(payload);
      return context.sessionService.start(parsed);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STOP,
    wrap(async (_event, sessionId: string) => {
      const stopped = await context.sessionService.stop(sessionId, "manual");
      return { success: stopped };
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_GET_STATE,
    wrap(async (_event, sessionId: string) => {
      return context.sessionService.getState(sessionId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SUBSCRIBE_EVENTS,
    wrap(async (_event, sessionId: string) => {
      const existing = sessionUnsubscribers.get(sessionId);
      if (existing) {
        existing();
      }

      const unsubscribe = context.sessionService.subscribeEvents(sessionId, (event: SessionEvent) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.SESSION_EVENT_STREAM, event);
        }
      });

      sessionUnsubscribers.set(sessionId, unsubscribe);
      return { success: true };
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_PICK_VIDEO_FILE,
    wrap(async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [
          {
            name: "Video Files",
            extensions: ["mp4", "mov", "mkv", "webm", "m4v"]
          }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    })
  );

  const cleanup = (): void => {
    for (const [sessionId, unsubscribe] of sessionUnsubscribers.entries()) {
      unsubscribe();
      sessionUnsubscribers.delete(sessionId);
    }

    ipcMain.removeHandler(IPC_CHANNELS.AUTH_SIGN_IN);
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_LIST_PROFILES);
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_REMOVE_PROFILE);
    ipcMain.removeHandler(IPC_CHANNELS.YT_LIST_REUSABLE_BROADCASTS);
    ipcMain.removeHandler(IPC_CHANNELS.YT_CREATE_DRAFT_BROADCAST);
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_START);
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_STOP);
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_GET_STATE);
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_SUBSCRIBE_EVENTS);
    ipcMain.removeHandler(IPC_CHANNELS.APP_PICK_VIDEO_FILE);
  };

  return cleanup;
};
