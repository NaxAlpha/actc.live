import fs from "node:fs";
import path from "node:path";

export type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type OAuthSetupStatus = {
  configured: boolean;
  source: "saved" | "env" | "none";
  clientIdHint?: string | undefined;
};

type KeytarLike = {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

const ACCOUNT_CLIENT_ID = "youtube-oauth-client-id";
const ACCOUNT_CLIENT_SECRET = "youtube-oauth-client-secret";

const maskClientId = (clientId: string): string => {
  if (clientId.length <= 8) {
    return `${clientId.slice(0, 2)}***`;
  }

  return `${clientId.slice(0, 6)}...${clientId.slice(-4)}`;
};

const readEnvCredentials = (): OAuthCredentials | null => {
  const clientId = process.env.YT_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.YT_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
};

export class AppSettingsService {
  private readonly fallbackFilePath: string;
  private keytar: KeytarLike | null = null;

  constructor(private readonly userDataDir: string, private readonly serviceName: string) {
    this.fallbackFilePath = path.join(userDataDir, "app-settings.secrets.json");
  }

  async init(): Promise<void> {
    try {
      const keytarModule = await import("keytar");
      this.keytar = (keytarModule.default ?? keytarModule) as unknown as KeytarLike;
    } catch (_error) {
      this.keytar = null;
    }
  }

  async getOAuthSetupStatus(): Promise<OAuthSetupStatus> {
    const fromEnv = readEnvCredentials();
    if (fromEnv) {
      return {
        configured: true,
        source: "env",
        clientIdHint: maskClientId(fromEnv.clientId)
      };
    }

    const stored = await this.getStoredOAuthCredentials();
    if (stored) {
      return {
        configured: true,
        source: "saved",
        clientIdHint: maskClientId(stored.clientId)
      };
    }

    return {
      configured: false,
      source: "none"
    };
  }

  async getOAuthCredentials(): Promise<OAuthCredentials | null> {
    const fromEnv = readEnvCredentials();
    if (fromEnv) {
      return fromEnv;
    }

    return this.getStoredOAuthCredentials();
  }

  async setOAuthCredentials(input: OAuthCredentials): Promise<void> {
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret.trim();

    if (!clientId || !clientSecret) {
      throw new Error("Both OAuth Client ID and Client Secret are required");
    }

    if (this.keytar) {
      await this.keytar.setPassword(this.serviceName, ACCOUNT_CLIENT_ID, clientId);
      await this.keytar.setPassword(this.serviceName, ACCOUNT_CLIENT_SECRET, clientSecret);
      return;
    }

    fs.mkdirSync(this.userDataDir, { recursive: true });
    fs.writeFileSync(
      this.fallbackFilePath,
      JSON.stringify(
        {
          clientId,
          clientSecret
        },
        null,
        2
      ),
      {
        encoding: "utf8",
        mode: 0o600
      }
    );
  }

  async clearOAuthCredentials(): Promise<void> {
    if (this.keytar) {
      await this.keytar.deletePassword(this.serviceName, ACCOUNT_CLIENT_ID);
      await this.keytar.deletePassword(this.serviceName, ACCOUNT_CLIENT_SECRET);
    }

    fs.rmSync(this.fallbackFilePath, { force: true });
  }

  private async getStoredOAuthCredentials(): Promise<OAuthCredentials | null> {
    if (this.keytar) {
      const [clientId, clientSecret] = await Promise.all([
        this.keytar.getPassword(this.serviceName, ACCOUNT_CLIENT_ID),
        this.keytar.getPassword(this.serviceName, ACCOUNT_CLIENT_SECRET)
      ]);

      if (clientId && clientSecret) {
        return {
          clientId,
          clientSecret
        };
      }

      return null;
    }

    if (!fs.existsSync(this.fallbackFilePath)) {
      return null;
    }

    const raw = fs.readFileSync(this.fallbackFilePath, "utf8");
    const parsed = JSON.parse(raw) as { clientId?: string; clientSecret?: string };

    if (!parsed.clientId || !parsed.clientSecret) {
      return null;
    }

    return {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret
    };
  }
}
