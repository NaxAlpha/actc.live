import { AppSettingsService } from "./appSettingsService.js";
import { DatabaseService } from "./databaseService.js";
import { FfmpegService } from "./ffmpegService.js";
import { OauthService } from "./oauthService.js";
import { ProfileService } from "./profileService.js";
import { resolveRuntimePaths } from "./runtimeContext.js";
import { createSecretStore } from "./secretStore.js";
import { SessionRepository } from "./sessionRepository.js";
import { SessionService } from "./sessionService.js";
import { YoutubeService } from "./youtubeService.js";

export type AppContext = {
  db: DatabaseService;
  appSettingsService: AppSettingsService;
  profileService: ProfileService;
  oauthService: OauthService;
  youtubeService: YoutubeService;
  sessionService: SessionService;
};

export const createAppContext = async (): Promise<AppContext> => {
  const runtimePaths = resolveRuntimePaths();
  const db = new DatabaseService(runtimePaths.dbPath);
  await db.init();

  const appSettingsService = new AppSettingsService(
    runtimePaths.userDataDir,
    "actc.live.app-settings"
  );
  await appSettingsService.init();

  const secretStore = await createSecretStore("actc.live.oauth", runtimePaths.userDataDir);
  const profileService = new ProfileService(db, secretStore);
  const oauthService = new OauthService(profileService, appSettingsService);
  const youtubeService = new YoutubeService(oauthService);
  const sessionRepository = new SessionRepository(db);
  const ffmpegService = new FfmpegService({ ffmpegResourceDir: runtimePaths.ffmpegResourceDir });

  const sessionService = new SessionService(
    sessionRepository,
    ffmpegService,
    youtubeService,
    runtimePaths.tempDir
  );

  return {
    db,
    appSettingsService,
    profileService,
    oauthService,
    youtubeService,
    sessionService
  };
};
