export const IPC_CHANNELS = {
  SETTINGS_GET_OAUTH_SETUP: "settings.getOAuthSetup",
  SETTINGS_SAVE_OAUTH_SETUP: "settings.saveOAuthSetup",
  SETTINGS_CLEAR_OAUTH_SETUP: "settings.clearOAuthSetup",
  AUTH_SIGN_IN: "auth.signIn",
  AUTH_LIST_PROFILES: "auth.listProfiles",
  AUTH_REMOVE_PROFILE: "auth.removeProfile",
  YT_LIST_REUSABLE_BROADCASTS: "youtube.listReusableBroadcasts",
  YT_CREATE_DRAFT_BROADCAST: "youtube.createDraftBroadcast",
  SESSION_START: "session.start",
  SESSION_STOP: "session.stop",
  SESSION_GET_STATE: "session.getState",
  SESSION_SUBSCRIBE_EVENTS: "session.subscribeEvents",
  APP_PICK_VIDEO_FILE: "app.pickVideoFile",
  SESSION_EVENT_STREAM: "session.event",
  WINDOW_MINIMIZE: "window.minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window.toggleMaximize",
  WINDOW_CLOSE: "window.close",
  WINDOW_GET_STATE: "window.getState"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
