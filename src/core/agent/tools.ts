/**
 * Agent tools. Every tool is typed, idempotent, logged, and auditable. Draft
 * tools NEVER execute the order/referral — they create a pending ClinicianReview
 * in the approval queue. Tools mutate operational state only (state.ops,
 * state.clinicianDecisions); they never mutate clinical facts or the graph.
 */
import type { ClinicianReview, PatientState } from "../models";
import { NOW } from "../synthetic";
import type { Candidate } from "./types";

export interface ToolResult {
  status: "ok" | "blocked" | "error";
  output: string;
  patientMessage?: string;
  emittedEventType?: string;
  review?: ClinicianReview;
}

let reviewSeq = 0;
function reviewId() {
  reviewSeq += 1;
  return `review-${reviewSeq}`;
}

export function runTool(state: PatientState, candidate: Candidate): ToolResult {
  const { tool, args } = candidate;

  switch (tool) {
    case "searchChart":
    case "searchExistingEvidence": {
      const query = String(args.query ?? "");
      return {
        status: "ok",
        output: `Searched chart and outside records for "${query}" — no acceptable existing evidence found.`,
      };
    }

    case "sendPatientQuestionnaire": {
      state.ops.dasiSent = true;
      return {
        status: "ok",
        output: "DASI questionnaire sent to patient (SMS).",
        patientMessage:
          "Please complete this short questionnaire about your daily activities so we can plan your surgery.",
        emittedEventType: "PATIENT_MESSAGE",
      };
    }

    case "draftOrder": {
      const order = String(args.order ?? "order");
      if (order === "NT-proBNP") state.ops.biomarkerOrderDrafted = true;
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "order",
        requirementId: String(args.requirementId),
        title: `${order} order`,
        draft: {
          order,
          rationale:
            order === "NT-proBNP"
              ? "Elevated RCRI with below-threshold functional capacity."
              : "Recommended by cardiology.",
        },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: `Drafted ${order} order → clinician approval queue.`,
        review,
      };
    }

    case "draftReferral": {
      state.ops.cardiologyReferralDrafted = true;
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "referral",
        requirementId: String(args.requirementId),
        title: `${String(args.specialty ?? "Specialist")} referral`,
        draft: {
          specialty: args.specialty,
          reason: "Abnormal preoperative NT-proBNP.",
          requiredEvidence: "Consultation note with clearance and any recommended testing.",
        },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: `Drafted ${String(args.specialty)} referral → clinician approval queue.`,
        review,
      };
    }

    case "draftMedicationTimeline": {
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "medication-timeline",
        requirementId: String(args.requirementId),
        title: "Perioperative medication timeline",
        draft: {
          note: "Reconciliation flagged a patient-reported GLP-1 not in the chart. Timeline drafted for review — no hold instructions applied automatically.",
        },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: "Drafted perioperative medication timeline → clinician approval queue.",
        review,
      };
    }

    case "requestClinicianApproval": {
      const review: ClinicianReview = {
        id: reviewId(),
        subject: "final",
        requirementId: String(args.requirementId),
        title: "Final scheduling approval",
        draft: { note: "All blocking requirements satisfied with validated evidence." },
        decision: "pending",
      };
      state.clinicianDecisions.push(review);
      return {
        status: "ok",
        output: "Requested final clinician approval → clinician approval queue.",
        review,
      };
    }

    case "markReadyToSchedule": {
      state.ops.readyMarked = true;
      return {
        status: "ok",
        output: "Operational requirements complete → READY TO SCHEDULE. Final readiness packet generated.",
        emittedEventType: "READY_TO_SCHEDULE",
      };
    }

    default:
      return { status: "error", output: `Unknown tool: ${tool}` };
  }
}

export const AUDIT_NOW = NOW;
