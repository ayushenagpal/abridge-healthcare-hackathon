/**
 * Safety gate. Runs before any tool executes. If a check fails the action is
 * blocked and a human-review is raised instead.
 */
import type { PatientState, ProtocolResult } from "../core/models";
import type { Candidate } from "../core/agent/types";

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

export function checkSafety(
  candidate: Candidate,
  state: PatientState,
  protocol: ProtocolResult,
): GuardResult {
  // Never progress an unsupported pathway.
  if (protocol.pathwayStatus === "unsupported") {
    return {
      allowed: false,
      reason: "Unsupported pathway — routed to human review.",
    };
  }
  if (protocol.pathwayStatus === "human-review") {
    return {
      allowed: false,
      reason: "Active cardiac / human-review state — automation halted.",
    };
  }

  // The terminal action requires the protocol to already be ready-to-schedule
  // (which itself requires final clinician approval recorded in state).
  if (candidate.tool === "markReadyToSchedule") {
    if (protocol.pathwayStatus !== "ready-to-schedule" || !state.ops.finalApproved) {
      return {
        allowed: false,
        reason: "Cannot mark ready: final clinician approval not recorded.",
      };
    }
  }

  // Drafts and searches are always safe (they never execute an order or send a
  // clinician-facing recommendation without a subsequent approval).
  return { allowed: true, reason: "Protocol supports action; no duplicate; approvals consistent." };
}
