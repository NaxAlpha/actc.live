import http from "node:http";
import { URL } from "node:url";

import { shell } from "electron";
import { google } from "googleapis";

import type { Profile } from "@actc/shared";

import type { ProfileService } from "./profileService.js";
import type { StoredOAuthTokens } from "./secretStore.js";

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl"
];

const resolveOAuthCredentials = (): { clientId: string; clientSecret: string } => {
  const clientId = process.env.YT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YT_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing OAuth credentials. Set YT_OAUTH_CLIENT_ID and YT_OAUTH_CLIENT_SECRET in the environment."
    );
  }

  return { clientId, clientSecret };
};

const findOpenPort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const probeServer = http.createServer();
    probeServer.listen(0, "127.0.0.1", () => {
      const address = probeServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate local OAuth callback port"));
        return;
      }

      const port = address.port;
      probeServer.close(() => resolve(port));
    });
    probeServer.on("error", reject);
  });
};

const waitForOAuthCode = async (
  port: number,
  redirectUri: string
): Promise<{ code: string; redirectUri: string }> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for OAuth callback"));
    }, 180_000);

    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", redirectUri);

        if (requestUrl.pathname !== "/oauth2callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const denied = requestUrl.searchParams.get("error");
        if (denied) {
          clearTimeout(timeout);
          res.statusCode = 400;
          res.end("Authentication denied. You can close this tab.");
          server.close();
          reject(new Error(`OAuth denied: ${denied}`));
          return;
        }

        const code = requestUrl.searchParams.get("code");
        if (!code) {
          clearTimeout(timeout);
          res.statusCode = 400;
          res.end("Missing authorization code.");
          server.close();
          reject(new Error("OAuth callback did not include a code"));
          return;
        }

        clearTimeout(timeout);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end("<h3>Authentication complete. Return to the app.</h3>");
        server.close();

        resolve({ code, redirectUri });
      } catch (error) {
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });

    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.listen(port, "127.0.0.1");
  });
};

export class OauthService {
  constructor(private readonly profileService: ProfileService) {}

  async signIn(profileLabel: string): Promise<Profile> {
    const { clientId, clientSecret } = resolveOAuthCredentials();
    const port = await findOpenPort();
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

    const oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: OAUTH_SCOPES
    });

    const codePromise = waitForOAuthCode(port, redirectUri);
    await shell.openExternal(authUrl);

    const { code } = await codePromise;
    const { tokens } = await oauthClient.getToken(code);

    oauthClient.setCredentials(tokens);

    const youtube = google.youtube({ version: "v3", auth: oauthClient });
    const channelsResponse = await youtube.channels.list({
      part: ["id", "snippet"],
      mine: true,
      maxResults: 50
    });

    const channel = channelsResponse.data.items?.[0];
    if (!channel?.id || !channel.snippet?.title) {
      throw new Error("Authenticated Google account has no accessible YouTube channel");
    }

    const normalizedTokens: StoredOAuthTokens = {};
    if (tokens.access_token) {
      normalizedTokens.accessToken = tokens.access_token;
    }
    if (tokens.refresh_token) {
      normalizedTokens.refreshToken = tokens.refresh_token;
    }
    if (typeof tokens.expiry_date === "number") {
      normalizedTokens.expiryDate = tokens.expiry_date;
    }
    if (tokens.scope) {
      normalizedTokens.scope = tokens.scope;
    }
    if (tokens.token_type) {
      normalizedTokens.tokenType = tokens.token_type;
    }

    return this.profileService.createOrUpdateProfile({
      label: profileLabel,
      channelId: channel.id,
      channelTitle: channel.snippet.title,
      tokens: normalizedTokens
    });
  }

  async buildOAuthClientForProfile(profileId: string): Promise<InstanceType<typeof google.auth.OAuth2>> {
    const { clientId, clientSecret } = resolveOAuthCredentials();
    const oauthClient = new google.auth.OAuth2(clientId, clientSecret);

    const tokens = await this.profileService.getProfileTokens(profileId);
    if (!tokens?.refreshToken && !tokens?.accessToken) {
      throw new Error(`No OAuth tokens found for profile ${profileId}`);
    }

    const credentials: {
      access_token?: string | null;
      refresh_token?: string | null;
      expiry_date?: number | null;
      scope?: string;
      token_type?: string;
    } = {};

    if (tokens.accessToken) {
      credentials.access_token = tokens.accessToken;
    }
    if (tokens.refreshToken) {
      credentials.refresh_token = tokens.refreshToken;
    }
    if (typeof tokens.expiryDate === "number") {
      credentials.expiry_date = tokens.expiryDate;
    }
    if (tokens.scope) {
      credentials.scope = tokens.scope;
    }
    if (tokens.tokenType) {
      credentials.token_type = tokens.tokenType;
    }

    oauthClient.setCredentials(credentials);

    return oauthClient;
  }
}
