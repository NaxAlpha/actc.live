import { randomUUID } from "node:crypto";

import type { Profile } from "@actc/shared";

import type { DatabaseService } from "./databaseService.js";
import type { SecretStore, StoredOAuthTokens } from "./secretStore.js";

type ProfileRow = {
  id: string;
  label: string;
  channel_id: string;
  channel_title: string;
  created_at: string;
  updated_at: string;
};

export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly secretStore: SecretStore
  ) {}

  listProfiles(): Profile[] {
    const rows = this.db.query<ProfileRow>(
      "SELECT id, label, channel_id, channel_title, created_at, updated_at FROM profiles ORDER BY updated_at DESC"
    );

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getProfile(profileId: string): Profile | null {
    const row = this.db.query<ProfileRow>(
      "SELECT id, label, channel_id, channel_title, created_at, updated_at FROM profiles WHERE id = ? LIMIT 1",
      [profileId]
    )[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      label: row.label,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async createOrUpdateProfile(input: {
    label: string;
    channelId: string;
    channelTitle: string;
    tokens: StoredOAuthTokens;
  }): Promise<Profile> {
    const now = new Date().toISOString();
    const existing = this.db.query<ProfileRow>(
      "SELECT id, label, channel_id, channel_title, created_at, updated_at FROM profiles WHERE channel_id = ? LIMIT 1",
      [input.channelId]
    )[0];

    const id = existing?.id ?? randomUUID();
    const createdAt = existing?.created_at ?? now;

    await this.secretStore.setProfileTokens(id, input.tokens);
    try {
      this.db.transaction(() => {
        if (existing) {
          this.db.run(
            "UPDATE profiles SET label = ?, channel_title = ?, updated_at = ? WHERE id = ?",
            [input.label, input.channelTitle, now, id]
          );
        } else {
          this.db.run(
            "INSERT INTO profiles (id, label, channel_id, channel_title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            [id, input.label, input.channelId, input.channelTitle, createdAt, now]
          );
        }

        this.db.run(
          "INSERT OR REPLACE INTO profile_secrets (profile_id, keychain_ref, created_at) VALUES (?, ?, ?)",
          [id, id, now]
        );
      });
    } catch (error) {
      if (!existing) {
        await this.secretStore.deleteProfileTokens(id).catch(() => undefined);
      }
      throw error;
    }

    return {
      id,
      label: input.label,
      channelId: input.channelId,
      channelTitle: input.channelTitle,
      createdAt,
      updatedAt: now
    };
  }

  async getProfileTokens(profileId: string): Promise<StoredOAuthTokens | null> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    return this.secretStore.getProfileTokens(profileId);
  }

  async removeProfile(profileId: string): Promise<void> {
    this.db.transaction(() => {
      this.db.run("DELETE FROM profile_secrets WHERE profile_id = ?", [profileId]);
      this.db.run("DELETE FROM profiles WHERE id = ?", [profileId]);
    });

    await this.secretStore.deleteProfileTokens(profileId);
  }
}
