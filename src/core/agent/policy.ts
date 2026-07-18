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

  // ARISCAT optimization bundle — Tier 1 (auto-execute, no approval needed)
  const spiro = req(protocol, "pulm-opt-incentive-spirometry");
  if (spiro?.status === "missing") {
    candidates.push({
      tool: "performOptimization",
      args: { requirementId: "pulm-opt-incentive-spirometry", optimizationType: "incentive-spirometry" },
      requirementId: "pulm-opt-incentive-spirometry",
      label: "Provide incentive spirometry education",
      rationale: "ARISCAT high risk: instruct patient in incentive spirometry technique and prescribe for post-op use (Tier 1 — no approval needed)",
      cost: 2,
      tier: 1,
    });
  }

  const inhaler = req(protocol, "pulm-opt-inhaler-optimization");
  if (inhaler?.status === "searching" || inhaler?.status === "missing") {
    candidates.push({
      tool: "performOptimization",
      args: { requirementId: "pulm-opt-inhaler-optimization", optimizationType: "inhaler-optimization" },
      requirementId: "pulm-opt-inhaler-optimization",
      label: "Review and optimize inhaler regimen",
      rationale: "ARISCAT high risk: search chart for current LAMA/LABA/ICS regimen, confirm maximal therapy, note technique assessment needed (Tier 1)",
      cost: 2,
      tier: 1,
    });
  }

  const chestPt = req(protocol, "pulm-opt-chest-pt");
  if (chestPt?.status === "missing") {
    candidates.push({
      tool: "performOptimization",
      args: { requirementId: "pulm-opt-chest-pt", optimizationType: "chest-pt" },
      requirementId: "pulm-opt-chest-pt",
      label: "Instruct in breathing exercises and chest physiotherapy",
      rationale: "ARISCAT high risk: provide diaphragmatic breathing, cough technique, and early mobilization instruction (Tier 1)",
      cost: 2,
      tier: 1,
    });
  }

  // ARISCAT optimization bundle — Tier 2 (draft referral → clinician approval)
  const smokingCessation = req(protocol, "pulm-opt-smoking-cessation");
  if (
    smokingCessation?.status === "missing" &&
    !hasReview(state, (r) => r.subject === "referral" && r.requirementId === "pulm-opt-smoking-cessation")
  ) {
    candidates.push({
      tool: "draftReferral",
      args: { requirementId: "pulm-opt-smoking-cessation", specialty: "Smoking Cessation Program" },
      requirementId: "pulm-opt-smoking-cessation",
      label: "Draft smoking cessation referral",
      rationale: "ARISCAT high risk + current smoker: draft referral to cessation program — even brief preoperative cessation reduces pulmonary complications (Tier 2, needs approval)",
      cost: 4,
      tier: 2,
    });
  }

  const prehab = req(protocol, "pulm-opt-prehabilitation");
  if (
    prehab?.status === "missing" &&
    !hasReview(state, (r) => r.subject === "referral" && r.requirementId === "pulm-opt-prehabilitation")
  ) {
    candidates.push({
      tool: "draftReferral",
      args: { requirementId: "pulm-opt-prehabilitation", specialty: "Prehabilitation" },
      requirementId: "pulm-opt-prehabilitation",
      label: "Draft prehabilitation referral",
      rationale: "ARISCAT high risk (≥45): structured prehabilitation improves functional reserve. Draft referral for clinician approval (Tier 2)",
      cost: 5,
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
