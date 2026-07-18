import type { RequirementStatus } from "../core/models";

/** Human-readable labels — so a viewer never has to decode a color. */
export const STATUS_LABEL: Record<RequirementStatus, string> = {
  satisfied: "Satisfied",
  "not-indicated": "Not indicated",
  missing: "Needed",
  searching: "Searching",
  "waiting-patient": "Waiting · patient",
  "waiting-external": "Waiting · external",
  "waiting-clinician": "Waiting · clinician",
  "abnormal-review-required": "Abnormal · review",
  blocked: "Blocked",
  unsupported: "Unsupported",
};

/** Color family each status maps to (drives the legend + node styling). */
export type Tone = "done" | "wait" | "review" | "todo" | "stop";

export const STATUS_TONE: Record<RequirementStatus, Tone> = {
  satisfied: "done",
  "not-indicated": "done",
  missing: "todo",
  searching: "wait",
  "waiting-patient": "wait",
  "waiting-external": "wait",
  "waiting-clinician": "wait",
  "abnormal-review-required": "review",
  blocked: "stop",
  unsupported: "stop",
};

export const LEGEND: { tone: Tone; label: string }[] = [
  { tone: "todo", label: "Needed" },
  { tone: "wait", label: "In progress / waiting" },
  { tone: "review", label: "Needs clinical review" },
  { tone: "done", label: "Satisfied" },
  { tone: "stop", label: "Blocked" },
];
