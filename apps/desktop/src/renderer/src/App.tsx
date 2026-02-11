import { useEffect, useMemo, useState } from "react";

import type {
  NewBroadcastInput,
  Profile,
  ReusableBroadcast,
  SessionConfig,
  SessionEvent,
  SessionSummary
} from "@actc/shared";

type OAuthSetupState = {
  configured: boolean;
  source: "saved" | "env" | "none";
  clientIdHint?: string | undefined;
};

const toLocalDatetimeInputValue = (iso: string): string => {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toIsoFromLocalInput = (value: string): string => {
  const date = new Date(value);
  return date.toISOString();
};

const numberOrUndefined = (value: string): number | undefined => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

const nowPlusMinutes = (minutes: number): string => {
  return toLocalDatetimeInputValue(new Date(Date.now() + minutes * 60_000).toISOString());
};

export const App = (): JSX.Element => {
  const [oauthSetup, setOauthSetup] = useState<OAuthSetupState>({
    configured: false,
    source: "none"
  });
  const [showCredentialSetup, setShowCredentialSetup] = useState<boolean>(false);
  const [oauthClientId, setOauthClientId] = useState<string>("");
  const [oauthClientSecret, setOauthClientSecret] = useState<string>("");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [profileLabel, setProfileLabel] = useState<string>("Main Channel");
  const [videoPath, setVideoPath] = useState<string>("");

  const [trimStartSec, setTrimStartSec] = useState<string>("0");
  const [trimEndSec, setTrimEndSec] = useState<string>("15");
  const [maxRepeats, setMaxRepeats] = useState<string>("3");
  const [maxDurationSec, setMaxDurationSec] = useState<string>("");
  const [endAtLocal, setEndAtLocal] = useState<string>("");

  const [broadcastMode, setBroadcastMode] = useState<"create-new" | "reuse-existing">("create-new");
  const [reusableBroadcasts, setReusableBroadcasts] = useState<ReusableBroadcast[]>([]);
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string>("");

  const [newTitle, setNewTitle] = useState<string>("ACTC Loop Stream");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newPrivacyStatus, setNewPrivacyStatus] = useState<"private" | "unlisted" | "public">("unlisted");
  const [newScheduledStart, setNewScheduledStart] = useState<string>(nowPlusMinutes(10));

  const [sessionId, setSessionId] = useState<string>("");
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);

  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const isSessionActive =
    sessionSummary ? !["completed", "failed"].includes(sessionSummary.state) : false;

  const loadProfiles = async (): Promise<void> => {
    const loaded = await window.desktopApi.auth.listProfiles();
    setProfiles(loaded);

    if (loaded.length > 0) {
      setSelectedProfileId((current) => current || loaded[0]!.id);
    }
  };

  useEffect(() => {
    void (async () => {
      await Promise.all([loadProfiles(), loadOAuthSetup()]);
    })();
  }, []);

  const loadOAuthSetup = async (): Promise<void> => {
    const setup = await window.desktopApi.settings.getOAuthSetup();
    setOauthSetup(setup);
    setShowCredentialSetup(!setup.configured);
  };

  useEffect(() => {
    if (!selectedProfileId) {
      setReusableBroadcasts([]);
      setSelectedBroadcastId("");
      return;
    }

    void (async () => {
      try {
        const broadcasts = await window.desktopApi.youtube.listReusableBroadcasts(selectedProfileId);
        setReusableBroadcasts(broadcasts);
        if (broadcasts.length > 0) {
          setSelectedBroadcastId((current) => current || broadcasts[0]!.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reusable broadcasts");
      }
    })();
  }, [selectedProfileId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancel = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      unsubscribe = await window.desktopApi.session.subscribeEvents(sessionId, (event) => {
        if (!cancel) {
          setSessionEvents((previous) => [...previous, event]);
        }
      });
    })();

    const timer = setInterval(() => {
      void (async () => {
        const state = await window.desktopApi.session.getState(sessionId);
        if (!cancel) {
          setSessionSummary(state.summary);
        }
      })();
    }, 2000);

    return () => {
      cancel = true;
      clearInterval(timer);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [sessionId]);

  const handleSignIn = async (): Promise<void> => {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      if (!oauthSetup.configured) {
        throw new Error("Set OAuth credentials before signing in");
      }

      if (!profileLabel.trim()) {
        throw new Error("Profile label is required");
      }

      const created = await window.desktopApi.auth.signIn(profileLabel.trim());
      setNotice(`Signed in channel: ${created.channelTitle}`);
      await loadProfiles();
      setSelectedProfileId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOAuthSetup = async (): Promise<void> => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (!oauthClientId.trim() || !oauthClientSecret.trim()) {
        throw new Error("Client ID and Client Secret are required");
      }

      const setup = await window.desktopApi.settings.saveOAuthSetup({
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim()
      });

      setOauthSetup(setup);
      setOauthClientSecret("");
      setShowCredentialSetup(false);
      setNotice("OAuth credentials saved securely");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save OAuth credentials");
    } finally {
      setBusy(false);
    }
  };

  const handleClearOAuthSetup = async (): Promise<void> => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const setup = await window.desktopApi.settings.clearOAuthSetup();
      setOauthSetup(setup);
      setShowCredentialSetup(true);
      setNotice("Saved OAuth credentials removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear OAuth credentials");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveProfile = async (): Promise<void> => {
    if (!selectedProfileId) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await window.desktopApi.auth.removeProfile(selectedProfileId);
      setNotice("Profile removed");
      setSelectedProfileId("");
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove profile");
    } finally {
      setBusy(false);
    }
  };

  const handlePickVideo = async (): Promise<void> => {
    const selected = await window.desktopApi.app.pickVideoFile();
    if (selected) {
      setVideoPath(selected);
    }
  };

  const buildConfig = (): SessionConfig => {
    const trim = {
      startSec: Number.parseFloat(trimStartSec),
      endSec: Number.parseFloat(trimEndSec)
    };

    const stop: SessionConfig["stop"] = {
      strategy: "earliest-wins" as const
    };

    const parsedMaxRepeats = numberOrUndefined(maxRepeats);
    const parsedMaxDuration = numberOrUndefined(maxDurationSec);
    const parsedEndAt = endAtLocal ? toIsoFromLocalInput(endAtLocal) : undefined;

    if (parsedMaxRepeats) {
      stop.maxRepeats = parsedMaxRepeats;
    }
    if (parsedMaxDuration) {
      stop.maxDurationSec = parsedMaxDuration;
    }
    if (parsedEndAt) {
      stop.endAtIsoUtc = parsedEndAt;
    }

    if (!stop.maxRepeats && !stop.maxDurationSec && !stop.endAtIsoUtc) {
      throw new Error("At least one stop condition must be configured");
    }

    if (!selectedProfileId) {
      throw new Error("Select a profile before starting");
    }

    if (!videoPath) {
      throw new Error("Select a local video file before starting");
    }

    if (broadcastMode === "create-new") {
      const newBroadcast: NewBroadcastInput = {
        title: newTitle,
        privacyStatus: newPrivacyStatus,
        scheduledStartIsoUtc: toIsoFromLocalInput(newScheduledStart),
        latencyPreference: "low"
      };
      if (newDescription.trim()) {
        newBroadcast.description = newDescription.trim();
      }

      return {
        profileId: selectedProfileId,
        videoPath,
        trim,
        stop,
        broadcastMode,
        newBroadcast
      };
    }

    if (!selectedBroadcastId) {
      throw new Error("Choose an existing broadcast for reuse mode");
    }

    return {
      profileId: selectedProfileId,
      videoPath,
      trim,
      stop,
      broadcastMode,
      existingBroadcastId: selectedBroadcastId
    };
  };

  const handleStart = async (): Promise<void> => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const config = buildConfig();
      const result = await window.desktopApi.session.start(config);
      setSessionId(result.sessionId);
      setSessionEvents([]);
      setNotice(`Session started. Auto-stop at ${result.stopAtIsoUtc}`);

      const state = await window.desktopApi.session.getState(result.sessionId);
      setSessionSummary(state.summary);
      setSessionEvents(state.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await window.desktopApi.session.stop(sessionId);
      const state = await window.desktopApi.session.getState(sessionId);
      setSessionSummary(state.summary);
      setNotice("Stop requested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop session");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>ACTC Live Stream Loop Studio</h1>
        <p>Loop local video into YouTube Live with repeat-count, duration, and end-time controls.</p>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>0. API Credentials</h2>
          <p className="muted">
            Status:{" "}
            {oauthSetup.configured
              ? `Configured (${oauthSetup.source === "env" ? "Environment Variables" : "Saved in App"})`
              : "Not configured"}
          </p>
          {oauthSetup.clientIdHint ? (
            <p className="muted">Client ID: {oauthSetup.clientIdHint}</p>
          ) : null}
          <div className="row">
            <button disabled={busy} onClick={() => setShowCredentialSetup(true)}>
              {oauthSetup.configured ? "Edit Credentials" : "Set Credentials"}
            </button>
            <button
              disabled={busy || !oauthSetup.configured || oauthSetup.source === "env"}
              onClick={() => void handleClearOAuthSetup()}
            >
              Clear Saved
            </button>
          </div>
          <p className="muted">
            Need help? Open{" "}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Google Cloud Credentials
            </a>{" "}
            and create an OAuth Client ID (Desktop App), then enable YouTube Data API v3.
          </p>
        </section>

        <section className="panel">
          <h2>1. Channel Profiles</h2>
          <label>
            Profile Label
            <input
              value={profileLabel}
              onChange={(event) => setProfileLabel(event.target.value)}
              placeholder="Main Channel"
            />
          </label>
          <div className="row">
            <button disabled={busy || !oauthSetup.configured} onClick={() => void handleSignIn()}>
              OAuth Sign-In
            </button>
            <button disabled={busy || !selectedProfileId} onClick={() => void handleRemoveProfile()}>
              Remove
            </button>
          </div>

          <label>
            Active Profile
            <select
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
            >
              <option value="">Select profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label} ({profile.channelTitle})
                </option>
              ))}
            </select>
          </label>

          {selectedProfile ? (
            <p className="muted">Channel ID: {selectedProfile.channelId}</p>
          ) : null}
        </section>

        <section className="panel">
          <h2>2. Video + Trim</h2>
          <label>
            Local Video Path
            <div className="row">
              <input
                value={videoPath}
                onChange={(event) => setVideoPath(event.target.value)}
                placeholder="/path/to/video.mp4"
              />
              <button disabled={busy} onClick={() => void handlePickVideo()}>
                Browse
              </button>
            </div>
          </label>

          <div className="three-col">
            <label>
              Trim Start (sec)
              <input
                type="number"
                min={0}
                step={0.1}
                value={trimStartSec}
                onChange={(event) => setTrimStartSec(event.target.value)}
              />
            </label>
            <label>
              Trim End (sec)
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={trimEndSec}
                onChange={(event) => setTrimEndSec(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>3. Stop Conditions (Earliest Wins)</h2>
          <div className="three-col">
            <label>
              Max Repeats
              <input
                type="number"
                min={1}
                value={maxRepeats}
                onChange={(event) => setMaxRepeats(event.target.value)}
                placeholder="e.g. 3"
              />
            </label>
            <label>
              Max Duration (sec)
              <input
                type="number"
                min={1}
                value={maxDurationSec}
                onChange={(event) => setMaxDurationSec(event.target.value)}
                placeholder="e.g. 300"
              />
            </label>
            <label>
              End Time (local)
              <input
                type="datetime-local"
                value={endAtLocal}
                onChange={(event) => setEndAtLocal(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>4. Broadcast Mode</h2>
          <label>
            Mode
            <select
              value={broadcastMode}
              onChange={(event) => setBroadcastMode(event.target.value as "create-new" | "reuse-existing")}
            >
              <option value="create-new">Create New Broadcast</option>
              <option value="reuse-existing">Reuse Existing Broadcast</option>
            </select>
          </label>

          {broadcastMode === "create-new" ? (
            <>
              <label>
                Title
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="ACTC Loop Stream"
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                />
              </label>
              <div className="two-col">
                <label>
                  Privacy
                  <select
                    value={newPrivacyStatus}
                    onChange={(event) =>
                      setNewPrivacyStatus(event.target.value as "private" | "unlisted" | "public")
                    }
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <label>
                  Scheduled Start (local)
                  <input
                    type="datetime-local"
                    value={newScheduledStart}
                    onChange={(event) => setNewScheduledStart(event.target.value)}
                  />
                </label>
              </div>
            </>
          ) : (
            <label>
              Existing Broadcast
              <select
                value={selectedBroadcastId}
                onChange={(event) => setSelectedBroadcastId(event.target.value)}
              >
                <option value="">Select broadcast</option>
                {reusableBroadcasts.map((broadcast) => (
                  <option key={broadcast.id} value={broadcast.id}>
                    {broadcast.title} ({broadcast.scheduledStartIsoUtc})
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="panel">
          <h2>5. Session Control</h2>
          <div className="row">
            <button disabled={busy || !selectedProfileId || isSessionActive} onClick={() => void handleStart()}>
              Start Stream
            </button>
            <button disabled={busy || !sessionId || !isSessionActive} onClick={() => void handleStop()}>
              Stop Stream
            </button>
          </div>

          <div className="status-block">
            <p>
              <strong>Session ID:</strong> {sessionId || "-"}
            </p>
            <p>
              <strong>State:</strong> {sessionSummary?.state ?? "idle"}
            </p>
            <p>
              <strong>Broadcast ID:</strong> {sessionSummary?.broadcastId ?? "-"}
            </p>
            <p>
              <strong>Stream ID:</strong> {sessionSummary?.streamId ?? "-"}
            </p>
          </div>

          <div className="events">
            <h3>Session Events</h3>
            <ul>
              {sessionEvents.map((event) => (
                <li key={event.id}>
                  <span>[{event.ts}]</span> <strong>{event.level}</strong> <code>{event.code}</code> {event.message}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {showCredentialSetup ? (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="overlay-card">
            <h2>YouTube OAuth Credentials Setup</h2>
            <p className="muted">
              This app needs your Google OAuth Client ID + Client Secret for YouTube API access.
            </p>
            <ol className="instructions">
              <li>Go to Google Cloud Console for your project.</li>
              <li>Enable YouTube Data API v3.</li>
              <li>Create OAuth credentials with application type set to Desktop App.</li>
              <li>Copy the generated Client ID and Client Secret into the fields below.</li>
            </ol>
            <label>
              OAuth Client ID
              <input
                value={oauthClientId}
                onChange={(event) => setOauthClientId(event.target.value)}
                placeholder="1234567890-xxxx.apps.googleusercontent.com"
              />
            </label>
            <label>
              OAuth Client Secret
              <input
                value={oauthClientSecret}
                onChange={(event) => setOauthClientSecret(event.target.value)}
                type="password"
                placeholder="GOCSPX-..."
              />
            </label>
            <div className="row">
              <button disabled={busy} onClick={() => void handleSaveOAuthSetup()}>
                Save Credentials
              </button>
              <button disabled={busy || !oauthSetup.configured} onClick={() => setShowCredentialSetup(false)}>
                Close
              </button>
            </div>
            <p className="muted">
              Saved credentials are stored via OS keychain when available. Environment variables still override app-saved values.
            </p>
          </div>
        </div>
      ) : null}

      {error ? <div className="toast toast-error">{error}</div> : null}
      {notice ? <div className="toast toast-ok">{notice}</div> : null}
    </div>
  );
};
