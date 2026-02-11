export type WizardStepId = "credentials" | "media" | "broadcast" | "preflight" | "monitor";

export type StepValidityMap = Record<WizardStepId, boolean>;

export type StepState = "locked" | "ready" | "active" | "complete" | "error";

export type WizardStep = {
  id: WizardStepId;
  title: string;
  subtitle: string;
};

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: "credentials",
    title: "Credentials & Channel",
    subtitle: "OAuth setup and active profile"
  },
  {
    id: "media",
    title: "Video & Trim",
    subtitle: "Select media and clip range"
  },
  {
    id: "broadcast",
    title: "Stop Rules & Broadcast",
    subtitle: "Configure stopping strategy and destination"
  },
  {
    id: "preflight",
    title: "Preflight",
    subtitle: "Validation and launch readiness"
  },
  {
    id: "monitor",
    title: "Go Live & Monitor",
    subtitle: "Run and observe session state"
  }
] as const;
