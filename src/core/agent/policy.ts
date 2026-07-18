/**
 * Deterministic action policy. Given the current state and the protocol result,
 * it produces the ordered set of VALID operational candidate actions, following
 * the cost ladder (existing chart -> existing docs -> questionnaire -> outside
 * records -> lab -> referral) and prioritizing the critical path.
 *
 * The LLM only chooses among these candidates; the candidate set and ordering
 * are computed here, deterministically.
 */
import type { PatientState, ProtocolResult, Requirement } from "../models";
import type { Candidate } from "./types";

function req(protocol: ProtocolResult, id: string): Requirement | undefined {
  return protocol.requirements.find((r) => r.id === id);
}

function hasReview(
  state: PatientState,
  match: (r: PatientState["clinicianDecisions"][number]) => boolean,
): boolean {
  return state.clinicianDecisions.some(match);
}

export function computeCandidates(
  state: PatientState,
  protocol: ProtocolResult,
  searched: Set<string>,
): Candidate[] {
  const candidates: Candidate[] = [];
  const onPath = new Set(protocol.graph.criticalPath);

  const fc = req(protocol, "functional-capacity");
  if (fc?.status === "missing") {
    candidates.push({
      tool: "sendPatientQuestionnaire",
      args: { type: "DASI", requirementId: "functional-capacity" },
      requirementId: "functional-capacity",
      label: "Send DASI questionnaire",
      rationale:
        "Functional capacity is unknown; the guideline's lowest-cost path is a patient questionnaire before any testing",
      cost: 3,
      tier: 1,
    });
  }

  const bio = req(protocol, "biomarker");
  if (bio?.status === "missing") {
    if (!searched.has("biomarker")) {
      candidates.push({
        tool: "searchExistingEvidence",
        args: { requirementId: "biomarker", query: "NT-proBNP" },
        requirementId: "biomarker",
        label: "Search existing labs for NT-proBNP",
        rationale: "Search existing labs and outside records before ordering new testing",
        cost: 1,
        tier: 1,
      });
    } else {
      candidates.push({
        tool: "draftOrder",
        args: { requirementId: "biomarker", order: "NT-proBNP" },
        requirementId: "biomarker",
        label: "Draft NT-proBNP order",
        rationale: "No existing NT-proBNP found; draft an order for clinician approval",
        cost: 5,
        tier: 2,
      });
    }
  }

  const card = req(protocol, "cardiology-review");
  if (card?.status === "missing") {
    if (!searched.has("cardiology-review")) {
      candidates.push({
        tool: "searchExistingEvidence",
        args: { requirementId: "cardiology-review", query: "cardiology" },
        requirementId: "cardiology-review",
        label: "Search for existing cardiology records",
        rationale: "Check for an existing cardiology evaluation before referring",
        cost: 2,
        tier: 1,
      });
    } else {
      candidates.push({
        tool: "draftReferral",
        args: { requirementId: "cardiology-review", specialty: "Cardiology" },
        requirementId: "cardiology-review",
        label: "Draft cardiology referral",
        rationale: "Elevated NT-proBNP requires cardiology review; draft a referral for approval",
        cost: 6,
        tier: 2,
      });
    }
  }

  const echo = req(protocol, "echo");
  if (
    echo?.status === "missing" &&
    !hasReview(state, (r) => r.subject === "order" && r.title.includes("Echo"))
  ) {
    candidates.push({
      tool: "draftOrder",
      args: { requirementId: "echo", order: "Echocardiogram" },
      requirementId: "echo",
      label: "Draft echocardiogram order",
      rationale: "Cardiology clearance is conditional on an echocardiogram; draft the order",
      cost: 5,
      tier: 2,
    });
  }

  const med = req(protocol, "medication-review");
  if (
    med?.status === "waiting-clinician" &&
    !hasReview(state, (r) => r.subject === "medication-timeline")
  ) {
    candidates.push({
      tool: "draftMedicationTimeline",
      args: { requirementId: "medication-review" },
      requirementId: "medication-review",
      label: "Draft perioperative medication timeline",
      rationale: "A medication discrepancy needs clinician review; draft a timeline (no holds applied)",
      cost: 2,
      tier: 2,
    });
  }

  const ready = req(protocol, "ready-to-schedule");
  if (ready?.status === "waiting-clinician") {
    if (!hasReview(state, (r) => r.subject === "final")) {
      candidates.push({
        tool: "requestClinicianApproval",
        args: { requirementId: "ready-to-schedule", subject: "final" },
        requirementId: "ready-to-schedule",
        label: "Request final clinician approval",
        rationale: "All requirements met; request final approval to schedule",
        cost: 6,
        tier: 3,
      });
    }
  } else if (ready?.status === "satisfied" && !state.ops.readyMarked) {
    candidates.push({
      tool: "markReadyToSchedule",
      args: { requirementId: "ready-to-schedule" },
      requirementId: "ready-to-schedule",
      label: "Generate final readiness packet",
      rationale: "Final approval recorded; produce the readiness packet",
      cost: 0,
      tier: 3,
    });
  }

  // Sort: critical-path first, then cost ladder, then id for determinism.
  return candidates.sort((a, b) => {
    const ap = onPath.has(a.requirementId) ? 0 : 1;
    const bp = onPath.has(b.requirementId) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.requirementId.localeCompare(b.requirementId);
  });
}
