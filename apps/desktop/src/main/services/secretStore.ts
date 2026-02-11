import fs from "node:fs";
import path from "node:path";

export type StoredOAuthTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
};

export interface SecretStore {
  setProfileTokens(profileId: string, tokens: StoredOAuthTokens): Promise<void>;
  getProfileTokens(profileId: string): Promise<StoredOAuthTokens | null>;
  deleteProfileTokens(profileId: string): Promise<void>;
}

class FileFallbackSecretStore implements SecretStore {
  private readonly fallbackFilePath: string;

  constructor(private readonly userDataDir: string) {
    this.fallbackFilePath = path.join(userDataDir, "secrets.fallback.json");
  }

  async setProfileTokens(profileId: string, tokens: StoredOAuthTokens): Promise<void> {
    const current = this.readStore();
    current[profileId] = tokens;
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify(current, null, 2), "utf8");
  }

  async getProfileTokens(profileId: string): Promise<StoredOAuthTokens | null> {
    const current = this.readStore();
    return current[profileId] ?? null;
  }

  async deleteProfileTokens(profileId: string): Promise<void> {
    const current = this.readStore();
    delete current[profileId];
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify(current, null, 2), "utf8");
  }

  private readStore(): Record<string, StoredOAuthTokens> {
    if (!fs.existsSync(this.fallbackFilePath)) {
      return {};
    }

    const raw = fs.readFileSync(this.fallbackFilePath, "utf8");
    return JSON.parse(raw) as Record<string, StoredOAuthTokens>;
  }
}

class KeytarSecretStore implements SecretStore {
  constructor(
    private readonly serviceName: string,
    private readonly keytar: {
      setPassword: (service: string, account: string, password: string) => Promise<void>;
      getPassword: (service: string, account: string) => Promise<string | null>;
      deletePassword: (service: string, account: string) => Promise<boolean>;
    }
  ) {}

  async setProfileTokens(profileId: string, tokens: StoredOAuthTokens): Promise<void> {
    await this.keytar.setPassword(this.serviceName, profileId, JSON.stringify(tokens));
  }

  async getProfileTokens(profileId: string): Promise<StoredOAuthTokens | null> {
    const value = await this.keytar.getPassword(this.serviceName, profileId);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as StoredOAuthTokens;
  }

  async deleteProfileTokens(profileId: string): Promise<void> {
    await this.keytar.deletePassword(this.serviceName, profileId);
  }
}

export const createSecretStore = async (
  serviceName: string,
  userDataDir: string
): Promise<SecretStore> => {
  try {
    const keytarModule = await import("keytar");
    return new KeytarSecretStore(serviceName, keytarModule.default ?? keytarModule);
  } catch (_error) {
    return new FileFallbackSecretStore(userDataDir);
  }
};
