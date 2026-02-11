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
    fs.mkdirSync(this.userDataDir, { recursive: true });
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify(current, null, 2), {
      encoding: "utf8",
      mode: 0o600
    });
  }

  async getProfileTokens(profileId: string): Promise<StoredOAuthTokens | null> {
    const current = this.readStore();
    return current[profileId] ?? null;
  }

  async deleteProfileTokens(profileId: string): Promise<void> {
    const current = this.readStore();
    delete current[profileId];
    fs.mkdirSync(this.userDataDir, { recursive: true });
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify(current, null, 2), {
      encoding: "utf8",
      mode: 0o600
    });
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

class ResilientSecretStore implements SecretStore {
  constructor(
    private readonly primary: KeytarSecretStore | null,
    private readonly fallback: FileFallbackSecretStore
  ) {}

  async setProfileTokens(profileId: string, tokens: StoredOAuthTokens): Promise<void> {
    if (!this.primary) {
      await this.fallback.setProfileTokens(profileId, tokens);
      return;
    }

    try {
      await this.primary.setProfileTokens(profileId, tokens);
    } catch (_error) {
      await this.fallback.setProfileTokens(profileId, tokens);
    }
  }

  async getProfileTokens(profileId: string): Promise<StoredOAuthTokens | null> {
    if (this.primary) {
      try {
        const value = await this.primary.getProfileTokens(profileId);
        if (value) {
          return value;
        }
      } catch (_error) {
        // Fall through to file fallback.
      }
    }

    return this.fallback.getProfileTokens(profileId);
  }

  async deleteProfileTokens(profileId: string): Promise<void> {
    if (this.primary) {
      try {
        await this.primary.deleteProfileTokens(profileId);
      } catch (_error) {
        // Continue cleanup in fallback.
      }
    }

    await this.fallback.deleteProfileTokens(profileId);
  }
}

export const createSecretStore = async (
  serviceName: string,
  userDataDir: string
): Promise<SecretStore> => {
  const fallback = new FileFallbackSecretStore(userDataDir);

  try {
    const keytarModule = await import("keytar");
    const primary = new KeytarSecretStore(serviceName, keytarModule.default ?? keytarModule);
    return new ResilientSecretStore(primary, fallback);
  } catch (_error) {
    return fallback;
  }
};
