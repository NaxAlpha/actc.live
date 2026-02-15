import { useEffect, useMemo, useState } from "react";

import type {
  NewBroadcastInput,
  Profile,
  ReusableBroadcast,
  SessionConfig,
  SessionEvent,
  SessionSummary
} from "@actc/shared";

import { PreflightChecklist, type PreflightCheck } from "./components/PreflightChecklist.js";
import { WIZARD_STEPS, type StepValidityMap, type WizardStepId } from "./wizard.js";

type OAuthSetupState = {
  configured: boolean;
  source: "saved" | "env" | "none";
  clientIdHint?: string | undefined;
};

type ValidationResult = {
  valid: boolean;
  detail: string;
};

const STEP_ORDER: readonly WizardStepId[] = [
  "credentials",
  "media",
  "broadcast",
  "preflight",
  "monitor"
] as const;

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

const detectPlatform = (): "mac" | "win" => {
  const platform = (globalThis.navigator?.platform ?? "").toLowerCase();
  return platform.includes("mac") ? "mac" : "win";
};

const isEditableTarget = (event: KeyboardEvent): boolean => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
};

const previousUnlockedStep = (
  activeStep: WizardStepId,
  unlocked: Record<WizardStepId, boolean>
): WizardStepId => {
  let candidate: WizardStepId = "credentials";

  for (const stepId of STEP_ORDER) {
    if (!unlocked[stepId]) {
      break;
    }

    candidate = stepId;
    if (stepId === activeStep) {
      return stepId;
    }
  }

  return candidate;
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
  const [newScheduledStart, setNewScheduledStart] = useState<string>(nowPlusMinutes(1));

  const [activeStep, setActiveStep] = useState<WizardStepId>("credentials");

  const [sessionId, setSessionId] = useState<string>("");
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);

  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const [windowPlatform] = useState<"mac" | "win">(detectPlatform);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const isSessionActive =
    sessionSummary ? !["completed", "failed"].includes(sessionSummary.state) : false;

  const trimValidation = useMemo<ValidationResult>(() => {
    const start = Number.parseFloat(trimStartSec);
    const end = Number.parseFloat(trimEndSec);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return {
        valid: false,
        detail: "Trim start and end must be numeric."
      };
    }

    if (start < 0) {
      return {
        valid: false,
        detail: "Trim start cannot be negative."
      };
    }

    if (end <= start) {
      return {
        valid: false,
        detail: "Trim end must be greater than trim start."
      };
    }

    return {
      valid: true,
      detail: `Clip ${start}s to ${end}s is valid.`
    };
  }, [trimEndSec, trimStartSec]);

  const stopValidation = useMemo<ValidationResult>(() => {
    const parsedMaxRepeats = numberOrUndefined(maxRepeats);
    const parsedMaxDuration = numberOrUndefined(maxDurationSec);
    const parsedEndAt = endAtLocal ? toIsoFromLocalInput(endAtLocal) : undefined;

    if (!parsedMaxRepeats && !parsedMaxDuration && !parsedEndAt) {
      return {
        valid: false,
        detail: "Set at least one stop condition."
      };
    }

    return {
      valid: true,
      detail: "Stop conditions are configured."
    };
  }, [endAtLocal, maxDurationSec, maxRepeats]);

  const broadcastValidation = useMemo<ValidationResult>(() => {
    if (broadcastMode === "create-new") {
      if (!newTitle.trim()) {
        return {
          valid: false,
          detail: "Broadcast title is required for create-new mode."
        };
      }

      if (!newScheduledStart.trim()) {
        return {
          valid: false,
          detail: "Scheduled start time is required for create-new mode."
        };
      }

      return {
        valid: true,
        detail: "New broadcast settings are complete."
      };
    }

    if (!selectedBroadcastId) {
      return {
        valid: false,
        detail: "Select an existing broadcast for reuse mode."
      };
    }

    return {
      valid: true,
      detail: "Existing broadcast selected."
    };
  }, [broadcastMode, newScheduledStart, newTitle, selectedBroadcastId]);

  const stepValidity = useMemo<StepValidityMap>(() => {
    const credentials = oauthSetup.configured && Boolean(selectedProfileId);
    const media = Boolean(videoPath) && trimValidation.valid;
    const broadcast = stopValidation.valid && broadcastValidation.valid;

    return {
      credentials,
      media,
      broadcast,
      preflight: credentials && media && broadcast,
      monitor: Boolean(sessionId)
    };
  }, [broadcastValidation.valid, oauthSetup.configured, selectedProfileId, sessionId, stopValidation.valid, trimValidation.valid, videoPath]);

  const stepUnlocked = useMemo<Record<WizardStepId, boolean>>(
    () => ({
      credentials: true,
      media: stepValidity.credentials,
      broadcast: stepValidity.credentials && stepValidity.media,
      preflight: stepValidity.credentials && stepValidity.media && stepValidity.broadcast,
      monitor: Boolean(sessionId)
    }),
    [sessionId, stepValidity.broadcast, stepValidity.credentials, stepValidity.media]
  );

  const activeStepIndex = STEP_ORDER.indexOf(activeStep);
  const previousStep = activeStepIndex > 0 ? STEP_ORDER[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex < STEP_ORDER.length - 1 ? STEP_ORDER[activeStepIndex + 1] : null;

  const canContinue =
    activeStep === "credentials"
      ? stepValidity.credentials
      : activeStep === "media"
        ? stepValidity.media
        : activeStep === "broadcast"
          ? stepValidity.broadcast
          : false;

  const preflightChecks = useMemo<PreflightCheck[]>(
    () => [
      {
        id: "oauth",
        label: "OAuth credentials configured",
        detail: oauthSetup.configured
          ? `Configured from ${oauthSetup.source === "env" ? "environment" : "secure app storage"}.`
          : "Configure OAuth Client ID and Client Secret.",
        status: oauthSetup.configured ? "pass" : "fail",
        blocking: true
      },
      {
        id: "profile",
        label: "Active channel profile selected",
        detail: selectedProfile
          ? `${selectedProfile.label} (${selectedProfile.channelTitle})`
          : "Select a profile and complete OAuth sign-in.",
        status: selectedProfile ? "pass" : "fail",
        blocking: true
      },
      {
        id: "video",
        label: "Video source selected",
        detail: videoPath ? videoPath : "Choose a local video file to stream.",
        status: videoPath ? "pass" : "fail",
        blocking: true
      },
      {
        id: "trim",
        label: "Trim range valid",
        detail: trimValidation.detail,
        status: trimValidation.valid ? "pass" : "fail",
        blocking: true
      },
      {
        id: "stop",
        label: "Stop strategy defined",
        detail: stopValidation.detail,
        status: stopValidation.valid ? "pass" : "fail",
        blocking: true
      },
      {
        id: "broadcast",
        label: "Broadcast mode configured",
        detail: broadcastValidation.detail,
        status: broadcastValidation.valid ? "pass" : "fail",
        blocking: true
      },
      {
        id: "active-session",
        label: "No active session running",
        detail: isSessionActive
          ? "A session is currently active. Stop it before starting a new run."
          : "No active session detected.",
        status: isSessionActive ? "warn" : "pass",
        blocking: false
      }
    ],
    [broadcastValidation, isSessionActive, oauthSetup.configured, oauthSetup.source, selectedProfile, stopValidation, trimValidation, videoPath]
  );

  const blockingChecks = useMemo(
    () => preflightChecks.filter((check) => check.blocking && check.status === "fail"),
    [preflightChecks]
  );

  const loadProfiles = async (): Promise<void> => {
    const loaded = await window.desktopApi.auth.listProfiles();
    setProfiles(loaded);

    if (loaded.length > 0) {
      setSelectedProfileId((current) => current || loaded[0]!.id);
    }
  };

  const loadOAuthSetup = async (): Promise<void> => {
    const setup = await window.desktopApi.settings.getOAuthSetup();
    setOauthSetup(setup);
    setShowCredentialSetup(false);
  };

  useEffect(() => {
    void (async () => {
      await Promise.all([loadProfiles(), loadOAuthSetup()]);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const state = await window.desktopApi.window.getState();
        if (!state.transparencyEnabled) {
          document.documentElement.dataset.transparency = "disabled";
        }
      } catch {
        document.documentElement.dataset.transparency = "disabled";
      }
    })();
  }, []);

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
        const message = err instanceof Error ? err.message : "Failed to load reusable broadcasts";
        if (message.includes("No OAuth tokens found")) {
          setError(
            "Selected profile is missing OAuth tokens. Click Remove, then run OAuth Sign-In again for this channel."
          );
        } else {
          setError(message);
        }
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

  useEffect(() => {
    if (stepUnlocked[activeStep]) {
      return;
    }

    setActiveStep(previousUnlockedStep(activeStep, stepUnlocked));
  }, [activeStep, stepUnlocked]);

  const handleSignIn = async (): Promise<void> => {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      if (!oauthSetup.configured) {
        throw new Error("Set OAuth credentials before signing in");
      }

      const created = await window.desktopApi.auth.signIn("Channel");
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

  const handleRemoveChannel = async (profileId: string): Promise<void> => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await window.desktopApi.auth.removeProfile(profileId);
      setNotice("Channel removed");
      if (selectedProfileId === profileId) {
        setSelectedProfileId("");
      }
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove channel");
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

    if (!Number.isFinite(trim.startSec) || !Number.isFinite(trim.endSec) || trim.endSec <= trim.startSec) {
      throw new Error("Trim start and end must be valid numbers and end must be greater than start");
    }

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
      if (blockingChecks.length > 0) {
        throw new Error("Resolve blocking preflight items before starting");
      }

      if (isSessionActive) {
        throw new Error("Stop the active session before starting a new one");
      }

      const config = buildConfig();
      const result = await window.desktopApi.session.start(config);
      setSessionId(result.sessionId);
      setSessionEvents([]);
      setNotice(`Session started. Auto-stop at ${result.stopAtIsoUtc}`);

      const state = await window.desktopApi.session.getState(result.sessionId);
      setSessionSummary(state.summary);
      setSessionEvents(state.events);
      setActiveStep("monitor");
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

  const handleContinue = (): void => {
    if (!nextStep || !stepUnlocked[nextStep]) {
      return;
    }

    setError("");
    setActiveStep(nextStep);
  };

  const handleBack = (): void => {
    if (!previousStep || !stepUnlocked[previousStep]) {
      return;
    }

    setError("");
    setActiveStep(previousStep);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const hasModifier = windowPlatform === "mac" ? event.metaKey : event.ctrlKey;
      if (!hasModifier || event.altKey) {
        return;
      }

      if (
        event.key === "Enter" &&
        activeStep === "preflight" &&
        blockingChecks.length === 0 &&
        !busy &&
        !isEditableTarget(event)
      ) {
        event.preventDefault();
        void handleStart();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeStep, blockingChecks.length, busy, windowPlatform]);

  const stepHeading = WIZARD_STEPS.find((step) => step.id === activeStep);

  return (
    <div className="app-root">
      <div className="titlebar" role="banner">
        <div className="titlebar-drag-region" />
        <span className="titlebar-title">ACTC Live</span>
        {windowPlatform === "win" ? (
          <div className="titlebar-controls">
            <button
              type="button"
              className="titlebar-btn"
              aria-label="Minimize"
              onClick={() => void window.desktopApi.window.minimize()}
            >
              &#x2013;
            </button>
            <button
              type="button"
              className="titlebar-btn"
              aria-label="Maximize"
              onClick={() => void window.desktopApi.window.toggleMaximize()}
            >
              &#x25A1;
            </button>
            <button
              type="button"
              className="titlebar-btn titlebar-btn-close"
              aria-label="Close"
              onClick={() => void window.desktopApi.window.close()}
            >
              &#x2715;
            </button>
          </div>
        ) : null}
      </div>
      <main className="wizard-shell">
        <header className="wizard-header">
          <div className="wizard-header-top">
            <p className="wizard-title">ACTC Live Setup</p>
            <button
              type="button"
              className="settings-trigger ghost"
              aria-label="Open settings"
              title="Settings"
              onClick={() => setShowCredentialSetup(true)}
            >
              <svg
                className="settings-icon"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M3.8 10c0-.4.03-.8.09-1.18l-1.4-1.08 1.4-2.42 1.72.5c.3-.24.62-.45.98-.62l.34-1.74h2.8l.35 1.74c.35.17.67.38.97.62l1.73-.5 1.4 2.42-1.4 1.08c.06.38.09.78.09 1.18s-.03.8-.09 1.18l1.4 1.08-1.4 2.42-1.73-.5c-.3.24-.62.45-.97.62l-.35 1.74h-2.8l-.34-1.74a5.4 5.4 0 0 1-.98-.62l-1.72.5-1.4-2.42 1.4-1.08A7.8 7.8 0 0 1 3.8 10Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              {!oauthSetup.configured ? <span className="settings-dot" aria-hidden="true" /> : null}
              <span className="sr-only">Settings</span>
            </button>
          </div>
          <p className="wizard-count">
            Step {activeStepIndex + 1} of {STEP_ORDER.length}
          </p>
          <h1>{stepHeading?.title}</h1>
          <p className="muted">{stepHeading?.subtitle}</p>

          <ol className="wizard-progress" aria-label="Setup progress">
            {WIZARD_STEPS.map((step, index) => {
              const state =
                index < activeStepIndex
                  ? "complete"
                  : index === activeStepIndex
                    ? "active"
                    : "upcoming";

              return (
                <li key={step.id} className={`wizard-progress-item progress-${state}`}>
                  <span className="progress-index">{index + 1}</span>
                  <span className="progress-label">{step.title}</span>
                </li>
              );
            })}
          </ol>
        </header>

        <section className="wizard-body">
          {activeStep === "credentials" ? (
            <>
              {!oauthSetup.configured ? (
                <section className="flow-section setup-warning">
                  <h2>Settings Required</h2>
                  <p className="muted">
                    OAuth credentials are not configured yet. Open Settings and add your OAuth Client ID and Client
                    Secret before signing in.
                  </p>
                  <div className="row">
                    <button type="button" onClick={() => setShowCredentialSetup(true)}>
                      Open Settings
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
              ) : null}

              <section className="flow-section">
                <h2>Authenticated Channels</h2>
                <p className="muted">
                  OAuth status:{" "}
                  {oauthSetup.source === "env" ? "Configured via Environment Variables" : "Configured in App Settings"}
                </p>
                {oauthSetup.clientIdHint ? <p className="muted">Client ID: {oauthSetup.clientIdHint}</p> : null}

                {profiles.length > 0 ? (
                  <div className="channel-list">
                    {profiles.map((profile) => (
                      <div
                        key={profile.id}
                        className={`channel-card${selectedProfileId === profile.id ? " channel-card-selected" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedProfileId(profile.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedProfileId(profile.id);
                          }
                        }}
                      >
                        <span className="channel-avatar" aria-hidden="true">
                          {profile.channelTitle.charAt(0).toUpperCase()}
                        </span>
                        <div className="channel-info">
                          <span className="channel-name">{profile.channelTitle}</span>
                          <span className="channel-id">{profile.channelId}</span>
                        </div>
                        <button
                          type="button"
                          className="channel-remove ghost"
                          aria-label={`Remove ${profile.channelTitle}`}
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRemoveChannel(profile.id);
                          }}
                        >
                          &#x2715;
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No channels added yet. Sign in to add one.</p>
                )}

                <div className="row">
                  <button type="button" disabled={busy || !oauthSetup.configured} onClick={() => void handleSignIn()}>
                    Add Channel
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {activeStep === "media" ? (
            <section className="flow-section">
              <h2>Video + Trim</h2>
              <label>
                Local Video Path
                <div className="row row-fill">
                  <input
                    value={videoPath}
                    onChange={(event) => setVideoPath(event.target.value)}
                    placeholder="/path/to/video.mp4"
                  />
                  <button type="button" disabled={busy} onClick={() => void handlePickVideo()}>
                    Browse
                  </button>
                </div>
              </label>

              <div className="two-col">
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

              <p className={`validation ${trimValidation.valid ? "validation-pass" : "validation-fail"}`}>
                {trimValidation.detail}
              </p>
            </section>
          ) : null}

          {activeStep === "broadcast" ? (
            <>
              <section className="flow-section">
                <h2>Stop Conditions (Earliest Wins)</h2>
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
                <p className={`validation ${stopValidation.valid ? "validation-pass" : "validation-fail"}`}>
                  {stopValidation.detail}
                </p>
              </section>

              <section className="flow-section">
                <h2>Broadcast Mode</h2>
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

                <p className={`validation ${broadcastValidation.valid ? "validation-pass" : "validation-fail"}`}>
                  {broadcastValidation.detail}
                </p>
              </section>
            </>
          ) : null}

          {activeStep === "preflight" ? (
            <>
              <PreflightChecklist checks={preflightChecks} />
              <section className="flow-section compact-section">
                <h2>Launch Readiness</h2>
                <p className="muted">
                  Launch is enabled only when all blocking checks pass. Shortcut: {windowPlatform === "mac" ? "Cmd" : "Ctrl"}+Enter.
                </p>
                {blockingChecks.length > 0 ? (
                  <p className="validation validation-fail" role="status" aria-live="polite">
                    Resolve {blockingChecks.length} blocking item{blockingChecks.length === 1 ? "" : "s"} before starting.
                  </p>
                ) : (
                  <p className="validation validation-pass" role="status" aria-live="polite">
                    Preflight checks passed. Ready to start.
                  </p>
                )}
              </section>
            </>
          ) : null}

          {activeStep === "monitor" ? (
            <section className="flow-section monitor-section">
              <h2>Session Monitor</h2>

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
          ) : null}
        </section>

        <footer className="wizard-footer">
          <button
            type="button"
            className="ghost"
            disabled={busy || !previousStep || !stepUnlocked[previousStep]}
            onClick={handleBack}
          >
            Back
          </button>

          {activeStep === "preflight" ? (
            <button
              type="button"
              disabled={busy || blockingChecks.length > 0 || isSessionActive}
              onClick={() => void handleStart()}
            >
              Start Stream
            </button>
          ) : activeStep === "monitor" ? (
            <button
              type="button"
              disabled={busy || !sessionId || !isSessionActive}
              onClick={() => void handleStop()}
            >
              Stop Stream
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !nextStep || !stepUnlocked[nextStep] || !canContinue}
              onClick={handleContinue}
            >
              Continue
            </button>
          )}
        </footer>
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
              <button type="button" disabled={busy} onClick={() => void handleSaveOAuthSetup()}>
                Save Credentials
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setShowCredentialSetup(false)}
              >
                Close
              </button>
            </div>
            <div className="row">
              <button
                type="button"
                className="ghost"
                disabled={busy || !oauthSetup.configured || oauthSetup.source === "env"}
                onClick={() => void handleClearOAuthSetup()}
              >
                Clear Saved Credentials
              </button>
            </div>
            <p className="muted">
              Saved credentials are stored via OS keychain when available. Environment variables still override app-saved values.
            </p>
          </div>
        </div>
      ) : null}

      {error || notice ? (
        <div className="toast-stack" aria-live="polite">
          {error ? (
            <div className="toast toast-error" role="alert">
              <span>Error: {error}</span>
              <button
                type="button"
                className="toast-dismiss"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="toast toast-ok" role="status">
              <span>Success: {notice}</span>
              <button
                type="button"
                className="toast-dismiss"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
